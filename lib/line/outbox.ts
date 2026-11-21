import { eq, and, isNull, sql } from "drizzle-orm";
import type { db } from "@/lib/db/client";
import { employees, users, leaveRequests, leaveTypes, lineIntegrationJobs, lineCalendarEvents } from "@/lib/db/schema";
import { hasPermission } from "@/lib/auth/permissions";
import { buildAdminLeaveRequestFlex, buildLeaveResultFlex, formatDateTime } from "@/lib/line/messages";
import { getLeaveStatistics } from "@/lib/line/statistics";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function enqueue(tx: Transaction, operationKey: string, kind: string, payload: Record<string, any>) {
  await tx.insert(lineIntegrationJobs).values({ operationKey, kind, payload }).onConflictDoNothing({ target: lineIntegrationJobs.operationKey });
}
export async function enqueueLeaveChange(tx: Transaction, id: string, action: string, channel = "Web") {
  // Existing HRM installations remain usable until the bot migration/config is enabled.
  if (process.env.LINE_BOT_ENABLED !== "true") return;
  const [leave] = await tx.select({ employeeId: leaveRequests.employeeId, firstName: employees.firstName, lastName: employees.lastName, code: employees.code, lineUid: employees.lineUid, type: leaveTypes.name, startOn: leaveRequests.startOn, endOn: leaveRequests.endOn, session: leaveRequests.session, reason: leaveRequests.reason, decidedBy: leaveRequests.decidedByEmployeeId, decidedAt: leaveRequests.decidedAt, revision: sql<string>`extract(epoch from ${leaveRequests.updatedAt})::text` }).from(leaveRequests).innerJoin(employees, eq(employees.id, leaveRequests.employeeId)).innerJoin(leaveTypes, eq(leaveRequests.leaveTypeCode, leaveTypes.code)).where(eq(leaveRequests.id, id));
  if (!leave) return;
  const name = `${leave.firstName} ${leave.lastName}`.trim();
  const reference = id.slice(0, 8);
  if (action === "pending" || action === "cancelled") {
    const approvers = await tx.select({ employeeId: employees.id, uid: employees.lineUid, permissions: users.permissions }).from(users).innerJoin(employees, eq(employees.id, users.employeeId)).where(and(eq(users.isActive, true), isNull(employees.deletedAt)));
    const year = formatDateTime(new Date()).slice(0, 4);
    const stats = action === "pending" ? await getLeaveStatistics(tx, leave.employeeId, Number(year)) : null;
    for (const approver of approvers) {
      if (!approver.uid || !hasPermission(approver.permissions, "leave.approve")) continue;
      const message = action === "pending" ? buildAdminLeaveRequestFlex({ reference, id, version: leave.revision, name, type: leave.type, start: leave.startOn, end: leave.endOn, session: leave.session === "full" ? "ลาเต็มวัน" : leave.session === "am" ? "ลาครึ่งวันเช้า" : "ลาครึ่งวันบ่าย", reason: leave.reason || "ไม่ได้ระบุเหตุผล", employeeCode: leave.code, channel, year, stats: stats! }) : { type: "text", text: `🔔 ใบลาแถวที่ (L${reference}) ของคุณ ${name} ได้ถูกผู้ขอยกเลิกรายการแล้ว` };
      await enqueue(tx, `leave:${id}:${action}:${approver.uid}`, "line.message", { to: approver.uid, employeeId: approver.employeeId, permission: "leave.approve", messages: [message] });
    }
  }
  const [decider] = leave.decidedBy ? await tx.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, lineUid: employees.lineUid }).from(employees).where(eq(employees.id, leave.decidedBy)) : [];
  const adminName = decider ? `${decider.firstName} ${decider.lastName}`.trim() : "LINE-Bot";
  if (action === "approved" || action === "rejected") {
    const message = buildLeaveResultFlex(action === "approved" ? "อนุมัติแล้ว" : "ไม่อนุมัติ", leave.type, name, leave.startOn, leave.endOn, adminName);
    if (leave.lineUid) await enqueue(tx, `leave:${id}:${action}:owner`, "line.message", { to: leave.lineUid, employeeId: leave.employeeId, leaveReadRequired: true, messages: [message] });
    if (decider?.lineUid && decider.lineUid !== leave.lineUid) await enqueue(tx, `leave:${id}:${action}:decider`, "line.message", { to: decider.lineUid, employeeId: decider.id, permission: "leave.approve", messages: [message] });
  }
  if (action === "approved") {
    const [event] = await tx.insert(lineCalendarEvents).values({ employeeId: leave.employeeId, leaveRequestId: id, title: `${leave.type} - ${name}`, startOn: leave.startOn, endOn: leave.endOn }).onConflictDoNothing({ target: lineCalendarEvents.leaveRequestId }).returning();
    const approvalTime = leave.decidedAt ? `${formatDateTime(leave.decidedAt, "display")} น.` : "";
    const description = `ประเภทการลา: ${leave.type}\nผู้ลา: ${name}\nสถานะ: อนุมัติแล้ว\nอนุมัติโดย: ${adminName}\nเวลาอนุมัติ: ${approvalTime}`;
    if (event) await enqueue(tx, `leave:${id}:calendar`, "calendar.upsert", { eventId: event.id, session: leave.session, description });
  }
}
