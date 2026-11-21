import { and, eq, gte, lte } from "drizzle-orm";
import { employees, leaveRequests, leaveTypes } from "@/lib/db/schema";
import { entitledQuotaDays } from "@/lib/leave/quota";
import { leaveDaySpan } from "@/app/api/leave/_shared";
import type { Transaction } from "@/lib/line/outbox";
import type { LeaveStatistics } from "@/lib/line/messages";

// Original display fields, backed by HRM records and quota policy instead of Sheets.
export async function getLeaveStatistics(tx: Transaction, employeeId: string, year: number): Promise<LeaveStatistics> {
  const [employee] = await tx.select({ startDate: employees.startDate }).from(employees).where(eq(employees.id, employeeId));
  const types = await tx.select().from(leaveTypes);
  const rows = await tx.select({ type: leaveRequests.leaveTypeCode, start: leaveRequests.startOn, end: leaveRequests.endOn, session: leaveRequests.session }).from(leaveRequests).where(and(eq(leaveRequests.employeeId, employeeId), eq(leaveRequests.statusCode, "approved"), gte(leaveRequests.startOn, `${year}-01-01`), lte(leaveRequests.startOn, `${year}-12-31`)));
  function summary(names: string[]) {
    const matches = types.filter((type) => names.includes(type.name));
    const used = rows.filter((row) => matches.some((type) => type.code === row.type)).reduce((total, row) => total + leaveDaySpan(row.start, row.end, row.session), 0);
    const primary = matches.find((type) => type.isActive) || matches[0];
    const quota = primary ? entitledQuotaDays({ ...primary, startDate: employee?.startDate, year }) : 0;
    return { used, quota };
  }
  const sick = summary(["ลาป่วย"]), personal = summary(["ลากิจ"]), birthday = summary(["ลาวันเกิด", "Birthday Leave"]);
  const quotaText = (value: number | null) => value == null ? "ไม่จำกัด" : String(value);
  return { sick: `${sick.used} วัน`, personal: `${personal.used} / ${quotaText(personal.quota)} วัน`, birthday: `${birthday.used} / ${quotaText(birthday.quota)} วัน` };
}
