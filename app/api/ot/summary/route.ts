import { and, eq, gte, lt } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees, overtimeRequests } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canViewCompanyOt } from "@/lib/auth/permissions";
import { currentBangkokMonth, durationHours, isValidMonthStr, jsonError, monthRangeUtc, round2 } from "@/app/api/ot/_shared";

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

async function companySummary(month: string, start: Date, end: Date) {
  const rows = await db
    .select({
      employeeId: overtimeRequests.employeeId,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      employeeCode: employees.code,
      statusCode: overtimeRequests.statusCode,
      startAt: overtimeRequests.startAt,
      endAt: overtimeRequests.endAt,
    })
    .from(overtimeRequests)
    .innerJoin(employees, eq(overtimeRequests.employeeId, employees.id))
    .where(and(gte(overtimeRequests.startAt, start), lt(overtimeRequests.startAt, end)));

  type EmployeeAgg = {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    approvedHours: number;
    pendingHours: number;
    rejectedHours: number;
    requestCount: number;
  };

  const byEmployeeMap = new Map<string, EmployeeAgg>();
  let totalApprovedHours = 0;
  let totalPendingHours = 0;

  for (const row of rows) {
    const hours = durationHours(row.startAt, row.endAt);
    let entry = byEmployeeMap.get(row.employeeId);
    if (!entry) {
      entry = {
        employeeId: row.employeeId,
        employeeName: `${row.employeeFirstName} ${row.employeeLastName}`.trim(),
        employeeCode: row.employeeCode,
        approvedHours: 0,
        pendingHours: 0,
        rejectedHours: 0,
        requestCount: 0,
      };
      byEmployeeMap.set(row.employeeId, entry);
    }
    entry.requestCount += 1;
    if (row.statusCode === "approved") {
      entry.approvedHours += hours;
      totalApprovedHours += hours;
    } else if (row.statusCode === "pending") {
      entry.pendingHours += hours;
      totalPendingHours += hours;
    } else if (row.statusCode === "rejected") {
      entry.rejectedHours += hours;
    }
  }

  const byEmployee = Array.from(byEmployeeMap.values())
    .map((entry) => ({
      ...entry,
      approvedHours: round2(entry.approvedHours),
      pendingHours: round2(entry.pendingHours),
      rejectedHours: round2(entry.rejectedHours),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "th"));

  return {
    scope: "company" as const,
    month,
    totalApprovedHours: round2(totalApprovedHours),
    totalPendingHours: round2(totalPendingHours),
    requestCount: rows.length,
    byEmployee,
  };
}

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const searchParams = request.nextUrl.searchParams;

  const monthParam = searchParams.get("month") ?? currentBangkokMonth();
  if (!isValidMonthStr(monthParam)) {
    return jsonError(400, "Invalid month");
  }

  const employeeIdParam = searchParams.get("employeeId");
  const { start, end } = monthRangeUtc(monthParam);

  if (user.role === "employee") {
    if (employeeIdParam && employeeIdParam !== user.employeeId) {
      return jsonError(403, "Forbidden");
    }
    return NextResponse.json(await individualSummary(user.employeeId, monthParam, start, end));
  }

  // supervisor / ceo
  if (employeeIdParam) {
    return NextResponse.json(await individualSummary(employeeIdParam, monthParam, start, end));
  }

  if (!canViewCompanyOt(user.role)) {
    return jsonError(403, "Forbidden");
  }
  return NextResponse.json(await companySummary(monthParam, start, end));
});
