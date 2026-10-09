import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { departments, employees, leaveRequests, leaveTypes, positions } from "@/lib/db/schema";
import { aggregateLeaveReport, type LeaveReportEmployee, type LeaveReportRequestRow, type LeaveReportType } from "./model";
import { getLeaveReportPeriod, type LeaveReportExportInput } from "./options";

export const MAX_LEAVE_REPORT_EMPLOYEES = 5_000;
export const MAX_LEAVE_REPORT_REQUESTS = 25_000;
export const MAX_LEAVE_REPORT_PICKLIST = 2_000;

export class LeaveReportServiceError extends Error {
  status: 400 | 413;

  constructor(status: 400 | 413, message: string) {
    super(message);
    this.name = "LeaveReportServiceError";
    this.status = status;
  }
}

export async function listLeaveReportEmployees() {
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
    .limit(MAX_LEAVE_REPORT_PICKLIST + 1);
  if (rows.length > MAX_LEAVE_REPORT_PICKLIST) {
    throw new LeaveReportServiceError(413, "มีพนักงานมากเกินกว่าจะแสดงในรายการ โปรดติดต่อผู้ดูแลระบบ");
  }
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: `${row.firstName} ${row.lastName}`.trim(),
    departmentName: row.departmentName ?? "ไม่ระบุแผนก",
  }));
}

export async function getOwnLeaveReportEmployee(employeeId: string) {
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

export async function createLeaveReportModel(input: LeaveReportExportInput, scope: "company" | "own", ownEmployeeId: string) {
  const period = getLeaveReportPeriod(input.year, input.month);
  const employeeIds = scope === "own" ? [ownEmployeeId] : input.employeeIds;
  const conditions = [
    eq(leaveRequests.statusCode, "approved"),
    lte(leaveRequests.startOn, period.endOn),
    gte(leaveRequests.endOn, period.startOn),
  ];
  if (employeeIds) conditions.push(inArray(leaveRequests.employeeId, employeeIds));

  const requestRows = await db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      leaveTypeCode: leaveRequests.leaveTypeCode,
      startOn: leaveRequests.startOn,
      endOn: leaveRequests.endOn,
      session: leaveRequests.session,
      reason: leaveRequests.reason,
    })
    .from(leaveRequests)
    .where(and(...conditions))
    .orderBy(asc(leaveRequests.startOn), asc(leaveRequests.id))
    .limit(MAX_LEAVE_REPORT_REQUESTS + 1);
  if (requestRows.length > MAX_LEAVE_REPORT_REQUESTS) {
    throw new LeaveReportServiceError(413, "รายการวันลามีจำนวนมากเกินกว่าจะสร้าง PDF ได้ โปรดลดช่วงเวลาหรือขอความช่วยเหลือจากผู้ดูแลระบบ");
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
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(positions, eq(employees.positionId, positions.id));
  if (employeeIds) {
    employeeQuery = employeeQuery.where(inArray(employees.id, employeeIds)) as typeof employeeQuery;
  } else {
    const requestEmployeeIds = [...new Set(requestRows.map((row) => row.employeeId))];
    const employedDuringPeriod = and(
      lte(employees.startDate, period.endOn),
      or(isNull(employees.endDate), gte(employees.endDate, period.startOn)),
    );
    employeeQuery = employeeQuery.where(requestEmployeeIds.length
      ? or(employedDuringPeriod, inArray(employees.id, requestEmployeeIds))
      : employedDuringPeriod) as typeof employeeQuery;
  }
  const employeeRows = await employeeQuery
    .orderBy(asc(employees.code), asc(employees.id))
    .limit(MAX_LEAVE_REPORT_EMPLOYEES + 1);
  if (employeeRows.length > MAX_LEAVE_REPORT_EMPLOYEES) {
    throw new LeaveReportServiceError(413, "มีพนักงานมากเกินกว่าจะสร้าง PDF ได้ โปรดลดขอบเขตหรือขอความช่วยเหลือจากผู้ดูแลระบบ");
  }
  if (employeeIds && employeeRows.length !== new Set(employeeIds).size) {
    throw new LeaveReportServiceError(400, "พบรหัสพนักงานที่ไม่มีอยู่ในระบบ");
  }

  const typeRows = await db
    .select({ code: leaveTypes.code, name: leaveTypes.name, isActive: leaveTypes.isActive })
    .from(leaveTypes)
    .orderBy(asc(leaveTypes.code));

  const reportEmployees: LeaveReportEmployee[] = employeeRows.map((employee) => ({
    ...employee,
    departmentName: employee.departmentName ?? "ไม่ระบุแผนก",
    positionName: employee.positionName ?? "ไม่ระบุตำแหน่ง",
  }));
  return aggregateLeaveReport({
    year: input.year,
    month: input.month,
    periodStart: period.startOn,
    periodEnd: period.endOn,
    employees: reportEmployees,
    leaveTypes: typeRows as LeaveReportType[],
    requests: requestRows as LeaveReportRequestRow[],
  });
}
