import { and, asc, eq, gte, lte } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees, leaveRequests, leaveTypes } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { jsonError, leaveDaySpan } from "@/app/api/leave/_shared";

// Leave quotas are annual, not monthly (no `month` param like OT's
// summary) — always scoped to the current calendar year via
// `new Date().getFullYear()`. Date-only columns, so no Bangkok-offset
// concerns anywhere here.
//
// A request that spans a year boundary (e.g. Dec 30 -> Jan 2) is counted
// entirely in the year its startOn falls in — a documented simplification,
// consistent with how leave is booked/decided as a single request.

function currentYearBounds(): { start: string; end: string } {
  const year = new Date().getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

async function individualSummary(employeeId: string) {
  const { start, end } = currentYearBounds();

  const [employee] = await db
    .select({ firstName: employees.firstName, lastName: employees.lastName })
    .from(employees)
    .where(eq(employees.id, employeeId));

  const types = await db
    .select({ code: leaveTypes.code, name: leaveTypes.name, annualQuotaDays: leaveTypes.annualQuotaDays })
    .from(leaveTypes)
    .where(eq(leaveTypes.isActive, true))
    .orderBy(asc(leaveTypes.name));

  const approvedRows = await db
    .select({
      leaveTypeCode: leaveRequests.leaveTypeCode,
      startOn: leaveRequests.startOn,
      endOn: leaveRequests.endOn,
      session: leaveRequests.session,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.statusCode, "approved"),
        gte(leaveRequests.startOn, start),
        lte(leaveRequests.startOn, end),
      ),
    );

  const usedByType = new Map<string, number>();
  for (const row of approvedRows) {
    const span = leaveDaySpan(row.startOn, row.endOn, row.session);
    usedByType.set(row.leaveTypeCode, (usedByType.get(row.leaveTypeCode) ?? 0) + span);
  }

  const quotas = types.map((type) => {
    const usedDays = usedByType.get(type.code) ?? 0;
    return {
      code: type.code,
      name: type.name,
      annualQuotaDays: type.annualQuotaDays,
      usedDays,
      remainingDays: type.annualQuotaDays == null ? null : type.annualQuotaDays - usedDays,
    };
  });

  return {
    scope: "individual" as const,
    employeeId,
    employeeName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : "",
    quotas,
  };
}

// Company-wide overview: aggregated across all leave types combined (a
// coarser granularity than the per-type individual view, matching a
// reasonable company-overview scope for supervisor/ceo).
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
  const employeeIdParam = request.nextUrl.searchParams.get("employeeId");

  if (user.role === "employee") {
    if (employeeIdParam && employeeIdParam !== user.employeeId) {
      return jsonError(403, "Forbidden");
    }
    return NextResponse.json(await individualSummary(user.employeeId));
  }

  // supervisor / ceo
  if (employeeIdParam) {
    return NextResponse.json(await individualSummary(employeeIdParam));
  }

  // Company scope — gated directly on role (no canViewCompanyLeave export;
  // this read-only company view doesn't warrant a new permissions.ts
  // function), mirroring app/api/ot/summary/route.ts's canViewCompanyOt gate.
  if (user.role !== "supervisor" && user.role !== "ceo") {
    return jsonError(403, "Forbidden");
  }
  return NextResponse.json(await companySummary());
});
