import { and, eq, gte, isNull, lt, or } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees, overtimeRequests } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canViewEmployeeCompensation, canViewCompanyOtData } from "@/lib/auth/rolePermissionAccess";
import { canViewOwnOtRequests } from "@/lib/auth/permissions";
import { deriveOvertimeType } from "@/lib/ot/overtime-type";
import { currentBangkokMonth, durationHours, isValidMonthStr, jsonError, monthRangeUtc, round2, utcToBangkokParts } from "@/app/api/ot/_shared";

async function individualSummary(employeeId: string, month: string, start: Date, end: Date) {
  const rows = await db
    .select({
      statusCode: overtimeRequests.statusCode,
      startAt: overtimeRequests.startAt,
      endAt: overtimeRequests.endAt,
    })
    .from(overtimeRequests)
    .where(
      and(
        eq(overtimeRequests.employeeId, employeeId),
        gte(overtimeRequests.startAt, start),
        lt(overtimeRequests.startAt, end),
      ),
    );

  const [employee] = await db
    .select({ firstName: employees.firstName, lastName: employees.lastName })
    .from(employees)
    .where(eq(employees.id, employeeId));

  let totalApprovedHours = 0;
  let totalPendingHours = 0;
  let totalRejectedHours = 0;
  const byStatus = { pending: 0, approved: 0, rejected: 0 };

  for (const row of rows) {
    const hours = durationHours(row.startAt, row.endAt);
    if (row.statusCode === "approved") {
      totalApprovedHours += hours;
      byStatus.approved += 1;
    } else if (row.statusCode === "pending") {
      totalPendingHours += hours;
      byStatus.pending += 1;
    } else if (row.statusCode === "rejected") {
      totalRejectedHours += hours;
      byStatus.rejected += 1;
    }
  }

  return {
    scope: "individual" as const,
    employeeId,
    employeeName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : "",
    month,
    totalApprovedHours: round2(totalApprovedHours),
    totalPendingHours: round2(totalPendingHours),
    totalRejectedHours: round2(totalRejectedHours),
    requestCount: rows.length,
    byStatus,
  };
}

async function companySummary(month: string, start: Date, end: Date, includeCompensation: boolean) {
  const periodStartDate = utcToBangkokParts(start).date;
  const periodEndDate = utcToBangkokParts(end).date;
  const rows = await db
    .select({
      employeeId: employees.id,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      employeeCode: employees.code,
      baseSalary: employees.baseSalary,
      otWeekdayMultiplier: employees.otWeekdayMultiplier,
      otHolidayMultiplier: employees.otHolidayMultiplier,
      workHoursPerDay: employees.workHoursPerDay,
      weeklyHolidays: employees.weeklyHolidays,
      requestId: overtimeRequests.id,
      statusCode: overtimeRequests.statusCode,
      startAt: overtimeRequests.startAt,
      endAt: overtimeRequests.endAt,
    })
    .from(employees)
    .leftJoin(
      overtimeRequests,
      and(
        eq(overtimeRequests.employeeId, employees.id),
        gte(overtimeRequests.startAt, start),
        lt(overtimeRequests.startAt, end),
      ),
    )
    .where(and(
      lt(employees.startDate, periodEndDate),
      or(isNull(employees.endDate), gte(employees.endDate, periodStartDate)),
    ));

  type EmployeeAgg = {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    baseSalary: number | null;
    otWeekdayMultiplier: number;
    otHolidayMultiplier: number;
    workHoursPerDay: number;
    approvedHours: number;
    weekdayApprovedHours: number;
    holidayApprovedHours: number;
    pendingHours: number;
    rejectedHours: number;
    requestCount: number;
  };

  const byEmployeeMap = new Map<string, EmployeeAgg>();
  let totalApprovedHours = 0;
  let totalPendingHours = 0;
  let requestCount = 0;

  for (const row of rows) {
    const hours = row.startAt && row.endAt ? durationHours(row.startAt, row.endAt) : 0;
    let entry = byEmployeeMap.get(row.employeeId);
    if (!entry) {
      entry = {
        employeeId: row.employeeId,
        employeeName: `${row.employeeFirstName} ${row.employeeLastName}`.trim(),
        employeeCode: row.employeeCode,
        baseSalary: row.baseSalary,
        otWeekdayMultiplier: row.otWeekdayMultiplier,
        otHolidayMultiplier: row.otHolidayMultiplier,
        workHoursPerDay: row.workHoursPerDay,
        approvedHours: 0,
        weekdayApprovedHours: 0,
        holidayApprovedHours: 0,
        pendingHours: 0,
        rejectedHours: 0,
        requestCount: 0,
      };
      byEmployeeMap.set(row.employeeId, entry);
    }
    if (row.requestId) {
      entry.requestCount += 1;
      requestCount += 1;
    }
    if (row.statusCode === "approved") {
      entry.approvedHours += hours;
      // Day type is derived from the date worked vs. the employee's weekly days off (not stored).
      if (row.startAt && deriveOvertimeType(row.startAt, row.weeklyHolidays) === "holiday") entry.holidayApprovedHours += hours;
      else entry.weekdayApprovedHours += hours;
      totalApprovedHours += hours;
    } else if (row.statusCode === "pending") {
      entry.pendingHours += hours;
      totalPendingHours += hours;
    } else if (row.statusCode === "rejected") {
      entry.rejectedHours += hours;
    }
  }

  const byEmployee = Array.from(byEmployeeMap.values())
    .map((entry) => {
      const approvedHours = round2(entry.approvedHours);
      const weekdayApprovedHours = round2(entry.weekdayApprovedHours);
      const holidayApprovedHours = round2(entry.holidayApprovedHours);
      const baseRow = {
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        employeeCode: entry.employeeCode,
        approvedHours,
        weekdayApprovedHours,
        holidayApprovedHours,
        pendingHours: round2(entry.pendingHours),
        rejectedHours: round2(entry.rejectedHours),
        requestCount: entry.requestCount,
      };

      if (!includeCompensation) return baseRow;

      const hourlyWage = entry.baseSalary == null ? null : entry.baseSalary / 30 / entry.workHoursPerDay;
      const weekdayRatePerHour = hourlyWage == null ? null : hourlyWage * entry.otWeekdayMultiplier;
      const holidayRatePerHour = hourlyWage == null ? null : hourlyWage * entry.otHolidayMultiplier;
      const approvedPay = approvedHours === 0
        ? 0
        : hourlyWage == null
          ? null
          : round2(
            (weekdayApprovedHours * (hourlyWage * entry.otWeekdayMultiplier))
            + (holidayApprovedHours * (hourlyWage * entry.otHolidayMultiplier)),
          );

      return {
        ...baseRow,
        baseSalary: entry.baseSalary,
        otWeekdayMultiplier: entry.otWeekdayMultiplier,
        otHolidayMultiplier: entry.otHolidayMultiplier,
        workHoursPerDay: entry.workHoursPerDay,
        hourlyWage: hourlyWage == null ? null : round2(hourlyWage),
        weekdayRatePerHour: weekdayRatePerHour == null ? null : round2(weekdayRatePerHour),
        holidayRatePerHour: holidayRatePerHour == null ? null : round2(holidayRatePerHour),
        approvedPay,
      };
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "th"));

  const missingPayInfoCount = includeCompensation
    ? byEmployee.filter((entry) => entry.approvedHours > 0 && (!("approvedPay" in entry) || entry.approvedPay == null)).length
    : 0;
  const totalApprovedPay = includeCompensation && missingPayInfoCount === 0
    ? round2(byEmployee.reduce((total, entry) => total + ("approvedPay" in entry ? entry.approvedPay ?? 0 : 0), 0))
    : null;

  return {
    scope: "company" as const,
    month,
    totalApprovedHours: round2(totalApprovedHours),
    totalPendingHours: round2(totalPendingHours),
    requestCount,
    ...(includeCompensation ? { totalApprovedPay, missingPayInfoCount } : {}),
    byEmployee,
  };
}

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canViewOwnOtRequests(user.permissions) && !canViewCompanyOtData(user)) {
    return jsonError(403, "OT view permission required");
  }
  const searchParams = request.nextUrl.searchParams;

  const monthParam = searchParams.get("month") ?? currentBangkokMonth();
  if (!isValidMonthStr(monthParam)) {
    return jsonError(400, "Invalid month");
  }

  const employeeIdParam = searchParams.get("employeeId");
  const { start, end } = monthRangeUtc(monthParam);

  if (!canViewCompanyOtData(user)) {
    if (employeeIdParam && employeeIdParam !== user.employeeId) {
      return jsonError(403, "Forbidden");
    }
    return NextResponse.json(await individualSummary(user.employeeId, monthParam, start, end));
  }

  // Company-level access is determined by the account's permissions.
  if (employeeIdParam) {
    return NextResponse.json(await individualSummary(employeeIdParam, monthParam, start, end));
  }

  return NextResponse.json(await companySummary(monthParam, start, end, canViewEmployeeCompensation(user)));
});
