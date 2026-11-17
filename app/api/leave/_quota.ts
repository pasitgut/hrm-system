import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import type { db } from "@/lib/db/client";
import { leaveRequests, leaveTypes } from "@/lib/db/schema";
import { entitledQuotaDays } from "@/lib/leave/quota";
import { leaveDaySpan, leaveQuotaExceededMessage } from "@/app/api/leave/_shared";

// Quota enforcement shared by POST /api/leave and PATCH /api/leave/[id].
// Not a route itself (no HTTP method exports).

type LeaveTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type QuotaCheckFailure = { error: string; status: 400 | 409 };

/**
 * Checks that the requested days fit the employee's remaining entitlement for the leave type, counting
 * their other approved/pending requests that start in the same calendar year (a request spanning a year
 * boundary is counted in the year it starts, like the summary endpoint).
 *
 * Run inside the transaction that already holds the employee row lock, so two concurrent submissions
 * cannot both spend the same balance. Returns null when the request fits (or the type is uncapped).
 */
export async function checkLeaveQuota(input: {
  tx: LeaveTransaction;
  employeeId: string;
  employeeStartDate: string | null | undefined;
  leaveTypeCode: string;
  startOn: string;
  endOn: string;
  session: string;
  /** The request being edited: it must not count against itself. */
  excludeRequestId?: string;
}): Promise<QuotaCheckFailure | null> {
  const { tx, employeeId, leaveTypeCode, startOn, endOn, session, excludeRequestId } = input;

  const [leaveType] = await tx
    .select({ name: leaveTypes.name, annualQuotaDays: leaveTypes.annualQuotaDays, quotaBasis: leaveTypes.quotaBasis, isActive: leaveTypes.isActive })
    .from(leaveTypes)
    .where(eq(leaveTypes.code, leaveTypeCode));
  if (!leaveType?.isActive) return { error: "Unknown or inactive leave type", status: 400 };

  const year = startOn.slice(0, 4);
  const entitledDays = entitledQuotaDays({ ...leaveType, startDate: input.employeeStartDate, year: Number(year) });
  if (entitledDays == null) return null;

  const reservedRows = await tx
    .select({ startOn: leaveRequests.startOn, endOn: leaveRequests.endOn, session: leaveRequests.session })
    .from(leaveRequests)
    .where(and(
      eq(leaveRequests.employeeId, employeeId),
      eq(leaveRequests.leaveTypeCode, leaveTypeCode),
      inArray(leaveRequests.statusCode, ["approved", "pending"]),
      gte(leaveRequests.startOn, `${year}-01-01`),
      lte(leaveRequests.startOn, `${year}-12-31`),
      ...(excludeRequestId ? [ne(leaveRequests.id, excludeRequestId)] : []),
    ));
  const reservedDays = reservedRows.reduce((total, row) => total + leaveDaySpan(row.startOn, row.endOn, row.session), 0);
  const remainingDays = entitledDays - reservedDays;
  const requestedDays = leaveDaySpan(startOn, endOn, session);
  if (requestedDays > remainingDays) {
    return { error: leaveQuotaExceededMessage(leaveType.name, requestedDays, remainingDays), status: 409 };
  }
  return null;
}
