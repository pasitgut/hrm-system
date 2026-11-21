import { eq, and, isNull, sql } from "drizzle-orm";
import type { db } from "@/lib/db/client";
import { employees, users, leaveRequests, leaveTypes, lineIntegrationJobs, lineCalendarEvents } from "@/lib/db/schema";
import { hasPermission } from "@/lib/auth/permissions";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function enqueue(tx: Transaction, operationKey: string, kind: string, payload: Record<string, any>) {
  await tx.insert(lineIntegrationJobs).values({ operationKey, kind, payload }).onConflictDoNothing({ target: lineIntegrationJobs.operationKey });
}
export async function enqueueLeaveChange(tx: Transaction, id: string, action: string) {
  // Existing HRM installations remain usable until the bot migration/config is enabled.
  if (process.env.LINE_BOT_ENABLED !== "true") return;
  const [leave] = await tx.select({ employeeId: leaveRequests.employeeId, firstName: employees.firstName, lastName: employees.lastName, lineUid: employees.lineUid, type: leaveTypes.name, startOn: leaveRequests.startOn, endOn: leaveRequests.endOn, session: leaveRequests.session, revision: sql<string>`extract(epoch from ${leaveRequests.updatedAt})::text` }).from(leaveRequests).innerJoin(employees, eq(employees.id, leaveRequests.employeeId)).innerJoin(leaveTypes, eq(leaveRequests.leaveTypeCode, leaveTypes.code)).where(eq(leaveRequests.id, id));
  if (!leave) return;
  const text = `${leave.type}: ${leave.firstName} ${leave.lastName}\n${leave.startOn} ถึง ${leave.endOn}\nสถานะ: ${action}`;
  if (leave.lineUid) await enqueue(tx, `leave:${id}:${action}:owner`, "line.message", { to: leave.lineUid, employeeId: leave.employeeId, leaveReadRequired: true, messages: [{ type: "text", text }] });
  if (action === "pending") {
    const approvers = await tx.select({ employeeId: employees.id, uid: employees.lineUid, permissions: users.permissions }).from(users).innerJoin(employees, eq(employees.id, users.employeeId)).where(and(eq(users.isActive, true), isNull(employees.deletedAt)));
    for (const approver of approvers) {
      if (!approver.uid || !hasPermission(approver.permissions, "leave.approve")) continue;
      await enqueue(tx, `leave:${id}:pending:${approver.uid}`, "line.message", { to: approver.uid, employeeId: approver.employeeId, permission: "leave.approve", messages: [{ type: "template", altText: "คำขอลารออนุมัติ", template: { type: "buttons", text: text.slice(0, 160), actions: [{ type: "postback", label: "อนุมัติ", data: JSON.stringify({ action: "approve_leave", id, version: leave.revision }) }, { type: "postback", label: "ปฏิเสธ", data: JSON.stringify({ action: "reject_leave", id, version: leave.revision }) }] } }] });
    }
  }
  if (action === "approved") {
    const [event] = await tx.insert(lineCalendarEvents).values({ employeeId: leave.employeeId, leaveRequestId: id, title: `${leave.type} - ${leave.firstName} ${leave.lastName}`, startOn: leave.startOn, endOn: leave.endOn }).onConflictDoNothing({ target: lineCalendarEvents.leaveRequestId }).returning();
    if (event) await enqueue(tx, `leave:${id}:calendar`, "calendar.upsert", { eventId: event.id, session: leave.session });
  }
}
