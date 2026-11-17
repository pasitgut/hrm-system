import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees, overtimeRequests, requestStatuses } from "@/lib/db/schema";
import { deriveOvertimeType } from "@/lib/ot/overtime-type";
import { jsonError } from "@/lib/api/response";

// Shared helpers for the app/api/ot/** Route Handlers: Bangkok-local time
// conversion, the GET /api/ot response DTO, and the joined select used to
// build it. Not a route itself (no HTTP method exports), so Next.js ignores
// this file for routing purposes.

// Asia/Bangkok is a fixed UTC+7 offset with no DST — safe to hardcode.
export const BANGKOK_OFFSET_MINUTES = 7 * 60;

// Combines a "YYYY-MM-DD" date and "HH:mm" time — both entered by the user
// as Bangkok wall-clock values — into the UTC instant they represent.
export function bangkokToUtcDate(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0) - BANGKOK_OFFSET_MINUTES * 60_000);
}

// Inverse: a UTC instant back to the "YYYY-MM-DD" / "HH:mm" it displays as
// in Asia/Bangkok.
export function utcToBangkokParts(date: Date): { date: string; time: string } {
  const bangkok = new Date(date.getTime() + BANGKOK_OFFSET_MINUTES * 60_000);
  const y = bangkok.getUTCFullYear();
  const m = String(bangkok.getUTCMonth() + 1).padStart(2, "0");
  const d = String(bangkok.getUTCDate()).padStart(2, "0");
  const hh = String(bangkok.getUTCHours()).padStart(2, "0");
  const mi = String(bangkok.getUTCMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mi}` };
}

export function currentBangkokMonth(): string {
  return utcToBangkokParts(new Date()).date.slice(0, 7);
}

export function isValidDateStr(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidTimeStr(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidMonthStr(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// [start, end) bounds, expressed as UTC instants, for the given "YYYY-MM"
// month as it is understood in Asia/Bangkok local time.
export function monthRangeUtc(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = bangkokToUtcDate(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`, "00:00");
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = bangkokToUtcDate(`${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}-01`, "00:00");
  return { start, end };
}

// Payroll periods are labeled by the month in which they end: for example,
// 2026-09 covers 26 Aug through 25 Sep in Bangkok local time.
export function payrollPeriodRangeUtc(period: string): { start: Date; end: Date } {
  const [year, month] = period.split("-").map(Number);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const startMonth = String(previousMonth).padStart(2, "0");
  const endMonth = String(month).padStart(2, "0");
  const start = bangkokToUtcDate(String(previousYear).padStart(4, "0") + "-" + startMonth + "-26", "00:00");
  const end = bangkokToUtcDate(String(year).padStart(4, "0") + "-" + endMonth + "-26", "00:00");
  return { start, end };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function durationHours(startAt: Date, endAt: Date): number {
  return round2((endAt.getTime() - startAt.getTime()) / 3_600_000);
}

// Columns for the standard employee/status join used by every OT read.
export const otSelectColumns = {
  id: overtimeRequests.id,
  employeeId: overtimeRequests.employeeId,
  employeeFirstName: employees.firstName,
  employeeLastName: employees.lastName,
  employeeCode: employees.code,
  startAt: overtimeRequests.startAt,
  endAt: overtimeRequests.endAt,
  weeklyHolidays: employees.weeklyHolidays,
  reason: overtimeRequests.reason,
  statusCode: overtimeRequests.statusCode,
  statusName: requestStatuses.name,
  decidedByEmployeeId: overtimeRequests.decidedByEmployeeId,
  decidedAt: overtimeRequests.decidedAt,
  decisionNote: overtimeRequests.decisionNote,
  createdAt: overtimeRequests.createdAt,
} as const;

type OtRow = {
  id: string;
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeCode: string;
  startAt: Date;
  endAt: Date;
  weeklyHolidays: number[];
  reason: string;
  statusCode: string;
  statusName: string;
  decidedByEmployeeId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
};

export type OtItemDto = ReturnType<typeof toOtItemDto>;

export function toOtItemDto(row: OtRow) {
  const { date, time: startTime } = utcToBangkokParts(row.startAt);
  const { time: endTime } = utcToBangkokParts(row.endAt);
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: `${row.employeeFirstName} ${row.employeeLastName}`.trim(),
    employeeCode: row.employeeCode,
    date,
    startTime,
    endTime,
    // Derived on read from the date worked vs. the employee's weekly days off; never stored.
    overtimeType: deriveOvertimeType(row.startAt, row.weeklyHolidays),
    durationHours: durationHours(row.startAt, row.endAt),
    reason: row.reason,
    statusCode: row.statusCode,
    statusName: row.statusName,
    decidedByEmployeeId: row.decidedByEmployeeId,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt.toISOString(),
  };
}

export function otBaseSelect() {
  return db
    .select(otSelectColumns)
    .from(overtimeRequests)
    .innerJoin(employees, eq(overtimeRequests.employeeId, employees.id))
    .innerJoin(requestStatuses, eq(overtimeRequests.statusCode, requestStatuses.code));
}

export async function fetchOtItemById(id: string): Promise<OtItemDto | null> {
  const [row] = await otBaseSelect().where(eq(overtimeRequests.id, id));
  return row ? toOtItemDto(row) : null;
}

export { jsonError };
