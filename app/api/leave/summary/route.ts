import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees, leaveRequests, leaveTypes } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { entitledQuotaDays } from "@/lib/leave/quota";
import { canViewCompanyLeave, canViewOwnLeaveRequests } from "@/lib/auth/permissions";
import { jsonError, leaveDaySpan } from "@/app/api/leave/_shared";

// Leave quotas are annual, not monthly (no `month` param like OT's
// summary). They default to the current calendar year and accept an
// explicit year for requests that begin outside it. Date-only columns,
// so no Bangkok-offset concerns anywhere here.
//
// A request that spans a year boundary (e.g. Dec 30 -> Jan 2) is counted
// entirely in the year its startOn falls in — a documented simplification,
// consistent with how leave is booked/decided as a single request.

function yearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function currentYearBounds(): { start: string; end: string } {
  return yearBounds(new Date().getFullYear());
}

async function individualSummary(employeeId: string, year = new Date().getFullYear()) {
  const { start, end } = yearBounds(year);

  const [employee] = await db
    .select({ firstName: employees.firstName, lastName: employees.lastName, startDate: employees.startDate })
    .from(employees)
    .where(eq(employees.id, employeeId));
  if (!employee) return null;

  const types = await db
    .select({ code: leaveTypes.code, name: leaveTypes.name, annualQuotaDays: leaveTypes.annualQuotaDays, quotaBasis: leaveTypes.quotaBasis })
    .from(leaveTypes)
    .where(eq(leaveTypes.isActive, true))
    .orderBy(asc(leaveTypes.name));

  const requestRows = await db
    .select({
      leaveTypeCode: leaveRequests.leaveTypeCode,
      statusCode: leaveRequests.statusCode,
      startOn: leaveRequests.startOn,
      endOn: leaveRequests.endOn,
      session: leaveRequests.session,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, employeeId),
        inArray(leaveRequests.statusCode, ["approved", "pending"]),
        gte(leaveRequests.startOn, start),
        lte(leaveRequests.startOn, end),
      ),
    );

  const usedByType = new Map<string, number>();
  const pendingByType = new Map<string, number>();
  for (const row of requestRows) {
    const span = leaveDaySpan(row.startOn, row.endOn, row.session);
    const totals = row.statusCode === "approved" ? usedByType : pendingByType;
    totals.set(row.leaveTypeCode, (totals.get(row.leaveTypeCode) ?? 0) + span);
  }

  const quotas = types.map((type) => {
    const usedDays = usedByType.get(type.code) ?? 0;
    const pendingDays = pendingByType.get(type.code) ?? 0;
    // Effective entitlement for this employee and year (pro-rated by service for "tenure" types).
    const entitledDays = entitledQuotaDays({ ...type, startDate: employee.startDate, year });
    return {
      code: type.code,
      name: type.name,
      annualQuotaDays: entitledDays,
      maxAnnualQuotaDays: type.annualQuotaDays,
      quotaBasis: type.quotaBasis,
      usedDays,
      pendingDays,
      remainingDays: entitledDays == null ? null : entitledDays - usedDays,
      availableDays: entitledDays == null ? null : entitledDays - usedDays - pendingDays,
    };
  });

  return {
    scope: "individual" as const,
    employeeId,
    employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
    quotas,
  };
}

// Company-wide overview: aggregated across all leave types combined (a
// coarser granularity than the per-type individual view).
async function companySummary() {
  const { start, end } = currentYearBounds();

  const rows = await db
    .select({
      employeeId: leaveRequests.employeeId,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      employeeCode: employees.code,
      statusCode: leaveRequests.statusCode,
      startOn: leaveRequests.startOn,
      endOn: leaveRequests.endOn,
      session: leaveRequests.session,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .where(and(gte(leaveRequests.startOn, start), lte(leaveRequests.startOn, end)));

  type EmployeeAgg = {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    approvedDays: number;
    pendingDays: number;
    requestCount: number;
  };

  const byEmployeeMap = new Map<string, EmployeeAgg>();

  for (const row of rows) {
    let entry = byEmployeeMap.get(row.employeeId);
    if (!entry) {
      entry = {
        employeeId: row.employeeId,
        employeeName: `${row.employeeFirstName} ${row.employeeLastName}`.trim(),
        employeeCode: row.employeeCode,
        approvedDays: 0,
        pendingDays: 0,
        requestCount: 0,
      };
      byEmployeeMap.set(row.employeeId, entry);
    }
    entry.requestCount += 1;
    const span = leaveDaySpan(row.startOn, row.endOn, row.session);
    if (row.statusCode === "approved") entry.approvedDays += span;
    else if (row.statusCode === "pending") entry.pendingDays += span;
  }

  const byEmployee = Array.from(byEmployeeMap.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName, "th"));

  return { scope: "company" as const, byEmployee };
}

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canViewOwnLeaveRequests(user.permissions) && !canViewCompanyLeave(user.permissions)) {
    return jsonError(403, "Leave view permission required");
  }
  const employeeIdParam = request.nextUrl.searchParams.get("employeeId");
  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam == null ? new Date().getFullYear() : Number(yearParam);
  if (yearParam != null && (!/^\d{4}$/.test(yearParam) || !Number.isInteger(year) || year < 1 || year > 9999)) {
    return jsonError(400, "Invalid year");
  }

  if (!canViewCompanyLeave(user.permissions)) {
    if (employeeIdParam && employeeIdParam !== user.employeeId) {
      return jsonError(403, "Forbidden");
    }
    const summary = await individualSummary(user.employeeId, year);
    if (!summary) return jsonError(409, "บัญชีผู้ใช้ไม่ตรงกับข้อมูลพนักงาน กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่");
    return NextResponse.json(summary);
  }

  // Company-level access is determined by the account's permissions.
  if (employeeIdParam) {
    const summary = await individualSummary(employeeIdParam, year);
    if (!summary) return jsonError(404, "Employee not found");
    return NextResponse.json(summary);
  }

  return NextResponse.json(await companySummary());
});
