import { and, asc, eq, gte, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  departments,
  employees,
  leaveRequests,
  leaveTypes,
  overtimeRequests,
  payrollRuns,
} from "@/lib/db/schema";

function isMissingPayrollRunsTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; cause?: unknown };
  if (record.code === "42P01") return true;
  if (typeof record.message === "string" && /relation ["']?payroll_runs["']? does not exist/i.test(record.message)) {
    return true;
  }
  return record.cause ? isMissingPayrollRunsTable(record.cause) : false;
}

/** Everything read from the database for one payroll period (no calculation happens here). */
export async function loadPayrollInputs(period: { start: Date; end: Date; startDate: string; endExclusiveDate: string }) {
  const [employeeRows, overtime, leaves] = await Promise.all([
    // Employees whose employment overlaps the period.
    db.select({
      employeeId: employees.id,
      code: employees.code,
      prefix: employees.prefix,
      firstName: employees.firstName,
      lastName: employees.lastName,
      citizenId: employees.citizenId,
      avatarUrl: employees.avatarUrl,
      startDate: employees.startDate,
      endDate: employees.endDate,
      department: departments.name,
      baseSalary: employees.baseSalary,
      payrollData: employees.payrollData,
      weekdayMultiplier: employees.otWeekdayMultiplier,
      holidayMultiplier: employees.otHolidayMultiplier,
      workHoursPerDay: employees.workHoursPerDay,
      weeklyHolidays: employees.weeklyHolidays,
    }).from(employees).leftJoin(departments, eq(employees.departmentId, departments.id)).where(and(
      lt(employees.startDate, period.endExclusiveDate),
      or(isNull(employees.endDate), gte(employees.endDate, period.startDate)),
    )).orderBy(asc(employees.code)),
    // OT requests that start inside the period (any status; the calculation decides what counts).
    db.select({
      employeeId: overtimeRequests.employeeId,
      startAt: overtimeRequests.startAt,
      endAt: overtimeRequests.endAt,
      statusCode: overtimeRequests.statusCode,
    })
      .from(overtimeRequests)
      .where(and(gte(overtimeRequests.startAt, period.start), lt(overtimeRequests.startAt, period.end))),
    // Approved leave overlapping the period.
    db.select({
      employeeId: leaveRequests.employeeId,
      type: leaveTypes.name,
      startOn: leaveRequests.startOn,
      endOn: leaveRequests.endOn,
      session: leaveRequests.session,
    })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeCode, leaveTypes.code))
      .where(and(
        eq(leaveRequests.statusCode, "approved"),
        gte(leaveRequests.endOn, period.startDate),
        lt(leaveRequests.startOn, period.endExclusiveDate),
      )),
  ]);
  return { employees: employeeRows, overtime, leaves };
}

export async function loadPayrollRun(year: number, month: number) {
  try {
    const [row] = await db
      .select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.year, year), eq(payrollRuns.month, month)))
      .limit(1);
    return row ?? null;
  } catch (error) {
    if (isMissingPayrollRunsTable(error)) return null;
    throw error;
  }
}

type PayrollInputs = Awaited<ReturnType<typeof loadPayrollInputs>>;
export type PayrollEmployeeInput = PayrollInputs["employees"][number];
export type PayrollOvertimeInput = PayrollInputs["overtime"][number];
export type PayrollLeaveInput = PayrollInputs["leaves"][number];
export type PayrollRunRecord = NonNullable<Awaited<ReturnType<typeof loadPayrollRun>>>;
