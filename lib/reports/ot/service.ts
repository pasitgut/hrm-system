import { and, asc, eq, gte, inArray, isNull, lte, lt, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { departments, employees, overtimeRequests, positions } from "@/lib/db/schema";
import { deriveOvertimeType } from "@/lib/ot/overtime-type";
import { aggregateOtReport, type OtReportEmployee, type OtReportRequestRow } from "./model";
import { getOtReportPeriod, type OtReportExportInput } from "./options";

export const MAX_OT_REPORT_EMPLOYEES = 5_000;
export const MAX_OT_REPORT_REQUESTS = 25_000;
export const MAX_OT_REPORT_PICKLIST = 2_000;

export class OtReportServiceError extends Error {
  status: 400 | 413;

  constructor(status: 400 | 413, message: string) {
    super(message);
    this.name = "OtReportServiceError";
    this.status = status;
  }
}

export async function listOtReportEmployees() {
  const rows = await db
    .select({
      id: employees.id,
      code: employees.code,
      firstName: employees.firstName,
      lastName: employees.lastName,
      departmentName: departments.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .orderBy(asc(employees.code), asc(employees.id))
    .limit(MAX_OT_REPORT_PICKLIST + 1);

  if (rows.length > MAX_OT_REPORT_PICKLIST) {
    throw new OtReportServiceError(413, "มีพนักงานมากเกินกว่าจะแสดงในรายการ โปรดติดต่อผู้ดูแลระบบ");
  }
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: `${row.firstName} ${row.lastName}`.trim(),
    departmentName: row.departmentName ?? "ไม่ระบุแผนก",
  }));
}

export async function getOwnOtReportEmployee(employeeId: string) {
  const [row] = await db
    .select({
      id: employees.id,
      code: employees.code,
      firstName: employees.firstName,
      lastName: employees.lastName,
      departmentName: departments.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: `${row.firstName} ${row.lastName}`.trim(),
    departmentName: row.departmentName ?? "ไม่ระบุแผนก",
  };
}

export async function createOtReportModel(input: OtReportExportInput, scope: "company" | "own", ownEmployeeId: string) {
  const period = getOtReportPeriod(input.year, input.month);
  const employeeIds = scope === "own" ? [ownEmployeeId] : input.employeeIds;
  const conditions = [
    eq(overtimeRequests.statusCode, "approved"),
    gte(overtimeRequests.startAt, period.startAt),
    lt(overtimeRequests.startAt, period.endAt),
  ];
  if (employeeIds) conditions.push(inArray(overtimeRequests.employeeId, employeeIds));

  const requestRows = await db
    .select({
      id: overtimeRequests.id,
      employeeId: overtimeRequests.employeeId,
      startAt: overtimeRequests.startAt,
      endAt: overtimeRequests.endAt,
      reason: overtimeRequests.reason,
    })
    .from(overtimeRequests)
    .where(and(...conditions))
    .orderBy(asc(overtimeRequests.startAt), asc(overtimeRequests.id))
    .limit(MAX_OT_REPORT_REQUESTS + 1);

  if (requestRows.length > MAX_OT_REPORT_REQUESTS) {
    throw new OtReportServiceError(413, "รายการ OT มีจำนวนมากเกินกว่าจะสร้าง PDF ได้ โปรดลดช่วงเวลาหรือขอความช่วยเหลือจากผู้ดูแลระบบ");
  }

  let employeeQuery = db
    .select({
      id: employees.id,
      code: employees.code,
      firstName: employees.firstName,
      lastName: employees.lastName,
      departmentId: employees.departmentId,
      departmentName: departments.name,
      positionId: employees.positionId,
      positionName: positions.name,
      startDate: employees.startDate,
      endDate: employees.endDate,
      weeklyHolidays: employees.weeklyHolidays,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(positions, eq(employees.positionId, positions.id));

  if (employeeIds) {
    employeeQuery = employeeQuery.where(inArray(employees.id, employeeIds)) as typeof employeeQuery;
  } else {
    const requestEmployeeIds = [...new Set(requestRows.map((row) => row.employeeId))];
    const employedDuringPeriod = and(
      lte(employees.startDate, period.endLocalDate),
      or(isNull(employees.endDate), gte(employees.endDate, period.startLocalDate)),
    );
    employeeQuery = employeeQuery.where(requestEmployeeIds.length
      ? or(employedDuringPeriod, inArray(employees.id, requestEmployeeIds))
      : employedDuringPeriod) as typeof employeeQuery;
  }

  const employeeRows = await employeeQuery
    .orderBy(asc(employees.code), asc(employees.id))
    .limit(MAX_OT_REPORT_EMPLOYEES + 1);
  if (employeeRows.length > MAX_OT_REPORT_EMPLOYEES) {
    throw new OtReportServiceError(413, "มีพนักงานมากเกินกว่าจะสร้าง PDF ได้ โปรดลดขอบเขตหรือขอความช่วยเหลือจากผู้ดูแลระบบ");
  }
  if (employeeIds && employeeRows.length !== new Set(employeeIds).size) {
    throw new OtReportServiceError(400, "พบรหัสพนักงานที่ไม่มีอยู่ในระบบ");
  }

  const weeklyHolidaysByEmployee = new Map(employeeRows.map((employee) => [employee.id, employee.weeklyHolidays]));
  const reportEmployees: OtReportEmployee[] = employeeRows.map(({ weeklyHolidays: _weeklyHolidays, ...employee }) => ({
    ...employee,
    departmentName: employee.departmentName ?? "ไม่ระบุแผนก",
    positionName: employee.positionName ?? "ไม่ระบุตำแหน่ง",
  }));

  return aggregateOtReport({
    year: input.year,
    month: input.month,
    periodStart: period.startLocalDate,
    periodEnd: period.endLocalDate,
    employees: reportEmployees,
    // Day type is derived from the date worked vs. the employee's weekly days off (not stored).
    requests: requestRows.map((row) => ({
      ...row,
      overtimeType: deriveOvertimeType(row.startAt, weeklyHolidaysByEmployee.get(row.employeeId)),
    })) satisfies OtReportRequestRow[],
  });
}
