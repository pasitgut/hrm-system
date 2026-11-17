import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { employees, leaveRequests, leaveTypes, requestStatuses } from "@/lib/db/schema";
import { jsonError } from "@/lib/api/response";

// Shared helpers for the app/api/leave/** Route Handlers: request-body
// validation, day-span math, the GET /api/leave response DTO, and the
// joined select used to build it. Not a route itself (no HTTP method
// exports), so Next.js ignores this file for routing purposes.
//
// Unlike OT, leaveRequests.startOn/endOn are plain "date" columns (no
// time-of-day, no timezone) — no Bangkok-offset conversion is needed
// anywhere here, just "YYYY-MM-DD" string validation/comparison.

export function isValidDateStr(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  } catch {
    return false;
  }
}

export const SESSION_VALUES = new Set(["full", "am", "pm"]);

export function isValidSession(value: unknown): value is "full" | "am" | "pm" {
  return typeof value === "string" && SESSION_VALUES.has(value);
}

// Inclusive day count between startOn/endOn, halved to 0.5 for a
// single-day am/pm (half-day) session. Both inputs are "YYYY-MM-DD"
// strings; comparing/diffing them as UTC-midnight Dates avoids any local
// timezone drift.
export function leaveDaySpan(startOn: string, endOn: string, session: string): number {
  if (startOn === endOn && session !== "full") return 0.5;
  const start = new Date(`${startOn}T00:00:00Z`).getTime();
  const end = new Date(`${endOn}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export function leaveQuotaExceededMessage(leaveTypeName: string, requestedDays: number, remainingDays: number): string {
  const formatDays = (value: number) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(value);
  return `จำนวนวันที่ขอ (${formatDays(requestedDays)} วัน) เกินโควต้าคงเหลือของ${leaveTypeName} (${formatDays(Math.max(0, remainingDays))} วัน)`;
}

export { jsonError };

// --- request body validation, shared by POST and PATCH ---

export type ValidatedLeaveInput = {
  leaveTypeCode: string;
  startOn: string;
  endOn: string;
  session: string;
  reason: string | null;
};

export type LeaveInputResult = { ok: true; value: ValidatedLeaveInput } | { ok: false; message: string };

export function parseLeaveInput(body: Record<string, unknown>): LeaveInputResult {
  const { leaveTypeCode, startOn, endOn, session, reason } = body;

  if (typeof leaveTypeCode !== "string" || !leaveTypeCode.trim()) {
    return { ok: false, message: "Invalid leave type" };
  }
  if (!isValidDateStr(startOn) || !isValidDateStr(endOn)) {
    return { ok: false, message: "Invalid date" };
  }
  if (startOn > endOn) {
    return { ok: false, message: "startOn must not be after endOn" };
  }
  const sessionValue = session ?? "full";
  if (!isValidSession(sessionValue)) {
    return { ok: false, message: "Invalid session" };
  }
  if (startOn !== endOn && sessionValue !== "full") {
    return { ok: false, message: "A half-day session requires a single-day request" };
  }
  if (reason != null && typeof reason !== "string") {
    return { ok: false, message: "Invalid reason" };
  }

  return {
    ok: true,
    value: {
      leaveTypeCode: leaveTypeCode.trim(),
      startOn,
      endOn,
      session: sessionValue,
      reason: typeof reason === "string" ? reason.trim() || null : null,
    },
  };
}

// Columns for the standard employee/leave-type/status join used by every
// leave read.
export const leaveSelectColumns = {
  id: leaveRequests.id,
  employeeId: leaveRequests.employeeId,
  employeeFirstName: employees.firstName,
  employeeLastName: employees.lastName,
  employeeCode: employees.code,
  leaveTypeCode: leaveRequests.leaveTypeCode,
  leaveTypeName: leaveTypes.name,
  startOn: leaveRequests.startOn,
  endOn: leaveRequests.endOn,
  session: leaveRequests.session,
  reason: leaveRequests.reason,
  statusCode: leaveRequests.statusCode,
  statusName: requestStatuses.name,
  decidedByEmployeeId: leaveRequests.decidedByEmployeeId,
  decidedAt: leaveRequests.decidedAt,
  decisionNote: leaveRequests.decisionNote,
  cancelledByEmployeeId: leaveRequests.cancelledByEmployeeId,
  cancelledAt: leaveRequests.cancelledAt,
  createdAt: leaveRequests.createdAt,
} as const;

type LeaveRow = {
  id: string;
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeCode: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  startOn: string;
  endOn: string;
  session: string;
  reason: string | null;
  statusCode: string;
  statusName: string;
  decidedByEmployeeId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  cancelledByEmployeeId: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
};

export type LeaveItemDto = ReturnType<typeof toLeaveItemDto>;

export function toLeaveItemDto(row: LeaveRow) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: `${row.employeeFirstName} ${row.employeeLastName}`.trim(),
    employeeCode: row.employeeCode,
    leaveTypeCode: row.leaveTypeCode,
    leaveTypeName: row.leaveTypeName,
    startOn: row.startOn,
    endOn: row.endOn,
    session: row.session,
    days: leaveDaySpan(row.startOn, row.endOn, row.session),
    reason: row.reason,
    statusCode: row.statusCode,
    statusName: row.statusName,
    decidedByEmployeeId: row.decidedByEmployeeId,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    decisionNote: row.decisionNote,
    cancelledByEmployeeId: row.cancelledByEmployeeId,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function leaveBaseSelect() {
  return db
    .select(leaveSelectColumns)
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeCode, leaveTypes.code))
    .innerJoin(requestStatuses, eq(leaveRequests.statusCode, requestStatuses.code));
}

export async function fetchLeaveItemById(id: string): Promise<LeaveItemDto | null> {
  const [row] = await leaveBaseSelect().where(eq(leaveRequests.id, id));
  return row ? toLeaveItemDto(row) : null;
}
