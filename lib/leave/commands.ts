import { and, eq, sql } from "drizzle-orm";
import { employees, leaveRequests } from "@/lib/db/schema";
import { canManageOwnLeaveRequests, hasPermission } from "@/lib/auth/permissions";
import { checkLeaveQuota } from "@/app/api/leave/_quota";
import type { ValidatedLeaveInput } from "@/app/api/leave/_shared";
import { enqueueLeaveChange, type Transaction } from "@/lib/line/outbox";

type Actor = { employeeId: string; permissions?: string[] };
export type CommandResult = { id: string } | { error: string; status: 400 | 403 | 404 | 409 };
export async function createLeave(tx: Transaction, user: Actor, input: ValidatedLeaveInput): Promise<CommandResult> {
  if (!canManageOwnLeaveRequests(user.permissions)) return { error: "Leave self-service permission required", status: 403 };
  // Serialize quota checks for one employee so concurrent submissions
  // cannot both spend the same remaining balance.
  const [employee] = await tx.select({ id: employees.id, startDate: employees.startDate }).from(employees).where(eq(employees.id, user.employeeId)).for("update");
  if (!employee) return { error: "บัญชีผู้ใช้ไม่ตรงกับข้อมูลพนักงาน กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่", status: 409 };
  const quotaFailure = await checkLeaveQuota({ tx, employeeId: user.employeeId, employeeStartDate: employee.startDate, ...input });
  if (quotaFailure) return quotaFailure;
  const [inserted] = await tx.insert(leaveRequests).values({ employeeId: user.employeeId, ...input, statusCode: "pending" }).returning({ id: leaveRequests.id });
  await enqueueLeaveChange(tx, inserted.id, "pending");
  return { id: inserted.id };
}
export async function decideLeave(tx: Transaction, user: Actor, id: string, decision: "approved" | "rejected", note: string | null = null, expectedRevision?: string): Promise<CommandResult> {
  if (!hasPermission(user.permissions, "leave.approve")) return { error: "Forbidden", status: 403 };
  const [existing] = await tx.select({ id: leaveRequests.id, statusCode: leaveRequests.statusCode }).from(leaveRequests).where(eq(leaveRequests.id, id));
  if (!existing) return { error: "Not found", status: 404 };
  if (existing.statusCode !== "pending") return { error: "Request has already been decided", status: 409 };
  const revisionCheck = expectedRevision === undefined ? [] : [sql`extract(epoch from ${leaveRequests.updatedAt})::text = ${expectedRevision}`];
  const now = new Date();
  const [updated] = await tx.update(leaveRequests).set({ statusCode: decision, decidedByEmployeeId: user.employeeId, decidedAt: now, decisionNote: note, updatedAt: now }).where(and(eq(leaveRequests.id, id), eq(leaveRequests.statusCode, "pending"), ...revisionCheck)).returning({ id: leaveRequests.id });
  if (!updated) return { error: expectedRevision ? "รายการถูกแก้ไข กรุณาเปิดข้อมูลล่าสุดใน HRM ก่อนพิจารณา" : "Request has already been decided", status: 409 };
  await enqueueLeaveChange(tx, id, decision);
  return { id };
}
export async function cancelLeave(tx: Transaction, user: Actor, id: string): Promise<CommandResult> {
  const [existing] = await tx.select({ employeeId: leaveRequests.employeeId, statusCode: leaveRequests.statusCode }).from(leaveRequests).where(eq(leaveRequests.id, id));
  if (!existing) return { error: "Not found", status: 404 };
  if (existing.employeeId !== user.employeeId || !canManageOwnLeaveRequests(user.permissions)) return { error: "Forbidden", status: 403 };
  if (existing.statusCode !== "pending") return { error: "Only a pending request can be cancelled", status: 409 };
  const now = new Date();
  const [updated] = await tx.update(leaveRequests).set({ statusCode: "cancelled", cancelledByEmployeeId: user.employeeId, cancelledAt: now, updatedAt: now }).where(and(eq(leaveRequests.id, id), eq(leaveRequests.employeeId, user.employeeId), eq(leaveRequests.statusCode, "pending"))).returning({ id: leaveRequests.id });
  if (!updated) return { error: "Only a pending request can be cancelled", status: 409 };
  await enqueueLeaveChange(tx, id, "cancelled");
  return { id };
}
