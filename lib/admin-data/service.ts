import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { isUniqueViolation, isForeignKeyViolation, postgresConstraintName, postgresErrorCode } from "@/lib/db/errors";
import {
  assetAgreementTemplates,
  assetAgreements,
  assetRequestAttachments,
  assetRequestEvents,
  assetRequestItems,
  assetRequests,
  departments,
  employeeDocuments,
  employees,
  employmentStatuses,
  employmentTypes,
  leaveRequests,
  leaveTypes,
  lineBotStates,
  lineCalendarEvents,
  lineIntegrationJobs,
  lineWebhookEvents,
  overtimeRequests,
  positions,
  requestStatuses,
  users,
  workTrackingActivities,
  workTrackingRecords,
  workTrackingRequests,
} from "@/lib/db/schema";
import { ADMIN_TABLES, getAdminTableMeta, type AdminTableKey } from "@/lib/admin-data/registry";
import { bangkokToUtcDate, utcToBangkokParts } from "@/app/api/ot/_shared";
import { isSystemAdminSession } from "@/lib/auth/admin";
import { hashPassword } from "@/lib/auth/password";
import { hasPermission } from "@/lib/auth/permissions";
import { getStoredPermissionsForRole } from "@/lib/auth/role-permissions";
import { isRole, normalizeRole, ROLE_META, USER_ROLES } from "@/lib/auth/roles";
import type { SessionPayload } from "@/lib/auth/session";
import type { WorkTrackingRecordStatus } from "@/lib/work-tracking/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_LOCAL_REGEX = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ASSET_STATUS_SET = new Set(["pending", "approved", "rejected", "return_pending", "returned", "unknown"]);
const WORK_STATUS_SET = new Set<WorkTrackingRecordStatus>(["in_progress", "completed", "delivered"]);
const OVERTIME_SOURCE_SET = new Set(["hrm", "line_bot"]);
const LEAVE_SESSION_SET = new Set(["full", "am", "pm"]);
const QUOTA_BASIS_SET = new Set(["fixed", "tenure"]);
const AGREEMENT_TYPE_SET = new Set(["borrow", "asset_form"]);
const AGREEMENT_STATUS_SET = new Set(["waiting_handover", "waiting_employee", "waiting_admin", "completed"]);

export class AdminDataError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function handleDbError(error: unknown): never {
  if (error instanceof AdminDataError) throw error;
  const code = postgresErrorCode(error);
  if (isUniqueViolation(error)) {
    const constraint = postgresConstraintName(error) ?? "";
    if (constraint.includes("email")) throw new AdminDataError(409, "อีเมลนี้ถูกใช้งานในระบบแล้ว");
    if (constraint.includes("code")) throw new AdminDataError(409, "รหัสนี้ถูกใช้งานในระบบแล้ว");
    if (constraint.includes("citizen_id")) throw new AdminDataError(409, "เลขบัตรประชาชนซ้ำในระบบ");
    if (constraint.includes("line_uid")) throw new AdminDataError(409, "LINE UID ซ้ำกับพนักงานอื่น");
    if (constraint.includes("employee_id")) throw new AdminDataError(409, "พนักงานนี้มีบัญชีผู้ใช้ในระบบอยู่แล้ว");
    if (constraint.includes("name")) throw new AdminDataError(409, "ชื่อรายการนี้มีอยู่ในระบบแล้ว");
    if (constraint.includes("house_round_date")) throw new AdminDataError(409, "มีบันทึกบ้าน รอบ และวันที่นี้อยู่แล้ว");
    throw new AdminDataError(409, "ข้อมูลซ้ำกับรายการที่มีอยู่แล้วในระบบ");
  }
  if (isForeignKeyViolation(error)) {
    throw new AdminDataError(409, "ไม่สามารถดำเนินการได้ เนื่องจากมีข้อมูลอ้างอิงที่เกี่ยวข้องหรือรหัสปลายทางไม่มีอยู่");
  }
  if (code === "23514") {
    throw new AdminDataError(400, "ข้อมูลไม่ผ่านเงื่อนไขตรวจสอบความถูกต้องของฐานข้อมูล");
  }
  if (code === "22P02") {
    throw new AdminDataError(400, "รูปแบบข้อมูลหรือวันที่ไม่ถูกต้อง");
  }
  throw error;
}

function assertUuid(value: unknown, label = "รหัสรายการ"): string {
  if (typeof value !== "string" || !UUID_REGEX.test(value.trim())) {
    throw new AdminDataError(400, `${label}ไม่ถูกต้อง`);
  }
  return value.trim();
}

function assertPositiveInt(value: unknown, label = "รหัสรายการ"): number {
  const num = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isInteger(num) || num <= 0) {
    throw new AdminDataError(400, `${label}ต้องเป็นจำนวนเต็มบวก`);
  }
  return num;
}

function assertNonEmptyText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminDataError(400, `กรุณาระบุ${label}`);
  }
  return value.trim();
}

function parseOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new AdminDataError(400, "รูปแบบข้อความไม่ถูกต้อง");
  const trimmed = value.trim();
  return trimmed || null;
}

function parseRequiredDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !DATE_REGEX.test(value.trim())) {
    throw new AdminDataError(400, `${label}ต้องอยู่ในรูปแบบ YYYY-MM-DD`);
  }
  return value.trim();
}

function parseOptionalDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return parseRequiredDate(value, label);
}

function parseOptionalInt(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(num)) {
    throw new AdminDataError(400, `${label}ต้องเป็นจำนวนเต็ม`);
  }
  return num;
}

function parseOptionalNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num)) {
    throw new AdminDataError(400, `${label}ต้องเป็นตัวเลข`);
  }
  return num;
}

function parseRequiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new AdminDataError(400, `${label}ต้องเป็น true หรือ false`);
  }
  return value;
}

function parseOptionalSelectInt(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "" || value === "__none__") return null;
  return assertPositiveInt(value, label);
}

function parseBangkokDateTime(value: unknown, label: string): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminDataError(400, `กรุณาระบุ${label}`);
  }
  const trimmed = value.trim();
  const localMatch = DATETIME_LOCAL_REGEX.exec(trimmed);
  if (localMatch) {
    return bangkokToUtcDate(localMatch[1], `${localMatch[2]}:${localMatch[3]}`);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new AdminDataError(400, `${label}ไม่ถูกต้อง`);
  }
  return parsed;
}

function formatBangkokDateTimeInput(value: Date | null): string {
  if (!value) return "";
  const parts = utcToBangkokParts(value);
  return `${parts.date}T${parts.time}`;
}

function formatBangkokDateTimeDisplay(value: Date | null): string {
  if (!value) return "";
  const parts = utcToBangkokParts(value);
  return `${parts.date} ${parts.time}`;
}

async function countTable(table: Parameters<typeof db.select>[0] extends never ? never : any): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table);
  return Number(row?.value ?? 0);
}

export async function listAdminResources() {
  const [
    employeesCount,
    usersCount,
    otCount,
    leaveCount,
    assetCount,
    wtRecordCount,
    wtRequestCount,
    wtActivityCount,
    docCount,
    deptCount,
    posCount,
    empStatusCount,
    empTypeCount,
    leaveTypeCount,
    templateCount,
    agreementCount,
    calendarCount,
    jobCount,
    botStateCount,
    webhookCount,
    employeeLookups,
    departmentLookups,
    positionLookups,
    statusLookups,
    typeLookups,
    leaveTypeLookups,
    requestStatusLookups,
  ] = await Promise.all([
    countTable(employees),
    countTable(users),
    countTable(overtimeRequests),
    countTable(leaveRequests),
    countTable(assetRequests),
    countTable(workTrackingRecords),
    countTable(workTrackingRequests),
    countTable(workTrackingActivities),
    countTable(employeeDocuments),
    countTable(departments),
    countTable(positions),
    countTable(employmentStatuses),
    countTable(employmentTypes),
    countTable(leaveTypes),
    countTable(assetAgreementTemplates),
    countTable(assetAgreements),
    countTable(lineCalendarEvents),
    countTable(lineIntegrationJobs),
    countTable(lineBotStates),
    countTable(lineWebhookEvents),
    db
      .select({
        id: employees.id,
        code: employees.code,
        firstName: employees.firstName,
        lastName: employees.lastName,
        deletedAt: employees.deletedAt,
      })
      .from(employees)
      .orderBy(asc(employees.code), asc(employees.firstName)),
    db.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name)),
    db.select({ id: positions.id, name: positions.name }).from(positions).orderBy(asc(positions.name)),
    db.select({ id: employmentStatuses.id, name: employmentStatuses.name }).from(employmentStatuses).orderBy(asc(employmentStatuses.id)),
    db.select({ id: employmentTypes.id, name: employmentTypes.name }).from(employmentTypes).orderBy(asc(employmentTypes.id)),
    db.select({ code: leaveTypes.code, name: leaveTypes.name }).from(leaveTypes).orderBy(asc(leaveTypes.name)),
    db.select({ code: requestStatuses.code, name: requestStatuses.name }).from(requestStatuses).orderBy(asc(requestStatuses.code)),
  ]);

  const countsByKey: Record<AdminTableKey, number> = {
    employees: employeesCount,
    users: usersCount,
    overtime_requests: otCount,
    leave_requests: leaveCount,
    asset_requests: assetCount,
    work_tracking_records: wtRecordCount,
    work_tracking_requests: wtRequestCount,
    work_tracking_activities: wtActivityCount,
    employee_documents: docCount,
    departments: deptCount,
    positions: posCount,
    employment_statuses: empStatusCount,
    employment_types: empTypeCount,
    leave_types: leaveTypeCount,
    asset_agreement_templates: templateCount,
    asset_agreements: agreementCount,
    line_calendar_events: calendarCount,
    line_integration_jobs: jobCount,
    line_bot_states: botStateCount,
    line_webhook_events: webhookCount,
  };

  return {
    tables: ADMIN_TABLES.map((meta) => ({
      ...meta,
      rowCount: countsByKey[meta.key] ?? 0,
    })),
    lookups: {
      employees: employeeLookups.map((emp) => ({
        value: emp.id,
        label: `${emp.code} · ${emp.firstName} ${emp.lastName}${emp.deletedAt ? " (พ้นสภาพ)" : ""}`,
      })),
      departments: departmentLookups.map((item) => ({ value: String(item.id), label: item.name })),
      positions: positionLookups.map((item) => ({ value: String(item.id), label: item.name })),
      employmentStatuses: statusLookups.map((item) => ({ value: String(item.id), label: item.name })),
      employmentTypes: typeLookups.map((item) => ({ value: String(item.id), label: item.name })),
      leaveTypes: leaveTypeLookups.map((item) => ({ value: item.code, label: `${item.name} (${item.code})` })),
      requestStatuses: requestStatusLookups.map((item) => ({ value: item.code, label: item.name })),
      roles: USER_ROLES.map((roleKey) => ({ value: roleKey, label: ROLE_META[roleKey].label })),
    },
  };
}

export type ListRowsOptions = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listAdminRows(
  tableKey: AdminTableKey,
  options: ListRowsOptions = {},
): Promise<{ rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(options.pageSize ?? 50)));
  const offset = (page - 1) * pageSize;
  const search = options.search?.trim() ?? "";
  const pattern = search ? `%${search}%` : "";

  switch (tableKey) {
    case "employees": {
      const whereClause = pattern
        ? or(
            ilike(employees.code, pattern),
            ilike(employees.firstName, pattern),
            ilike(employees.lastName, pattern),
            ilike(employees.email, pattern),
            ilike(employees.nickname, pattern),
          )
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(employees).where(whereClause),
        db
          .select({
            id: employees.id,
            code: employees.code,
            prefix: employees.prefix,
            firstName: employees.firstName,
            lastName: employees.lastName,
            nickname: employees.nickname,
            email: employees.email,
            phone: employees.phone,
            citizenId: employees.citizenId,
            lineUid: employees.lineUid,
            startDate: employees.startDate,
            endDate: employees.endDate,
            baseSalary: employees.baseSalary,
            departmentId: employees.departmentId,
            departmentName: departments.name,
            positionId: employees.positionId,
            positionName: positions.name,
            employmentStatusId: employees.employmentStatusId,
            employmentStatusName: employmentStatuses.name,
            employmentTypeId: employees.employmentTypeId,
            employmentTypeName: employmentTypes.name,
            deletedAt: employees.deletedAt,
          })
          .from(employees)
          .leftJoin(departments, eq(employees.departmentId, departments.id))
          .leftJoin(positions, eq(employees.positionId, positions.id))
          .leftJoin(employmentStatuses, eq(employees.employmentStatusId, employmentStatuses.id))
          .leftJoin(employmentTypes, eq(employees.employmentTypeId, employmentTypes.id))
          .where(whereClause)
          .orderBy(asc(employees.code), asc(employees.firstName))
          .limit(pageSize)
          .offset(offset),
      ]);
      return {
        rows: rows.map((row) => ({
          ...row,
          departmentId: row.departmentId == null ? "" : String(row.departmentId),
          positionId: row.positionId == null ? "" : String(row.positionId),
          employmentStatusId: row.employmentStatusId == null ? "" : String(row.employmentStatusId),
          employmentTypeId: row.employmentTypeId == null ? "" : String(row.employmentTypeId),
          isActive: row.deletedAt === null,
        })),
        total: Number(totalRow[0]?.value ?? 0),
        page,
        pageSize,
      };
    }

    case "users": {
      const whereClause = pattern
        ? or(
            ilike(users.email, pattern),
            ilike(employees.code, pattern),
            ilike(employees.firstName, pattern),
            ilike(employees.lastName, pattern),
          )
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db
          .select({ value: count() })
          .from(users)
          .innerJoin(employees, eq(users.employeeId, employees.id))
          .where(whereClause),
        db
          .select({
            id: users.id,
            employeeId: users.employeeId,
            employeeCode: employees.code,
            employeeFirstName: employees.firstName,
            employeeLastName: employees.lastName,
            email: users.email,
            role: users.role,
            isActive: users.isActive,
            mustChangePassword: users.mustChangePassword,
          })
          .from(users)
          .innerJoin(employees, eq(users.employeeId, employees.id))
          .where(whereClause)
          .orderBy(asc(employees.code), asc(users.email))
          .limit(pageSize)
          .offset(offset),
      ]);
      return {
        rows: rows.map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          employeeDisplay: `${row.employeeCode} · ${row.employeeFirstName} ${row.employeeLastName}`,
          email: row.email,
          role: normalizeRole(row.role),
          roleLabel: ROLE_META[normalizeRole(row.role)].label,
          isActive: row.isActive,
          mustChangePassword: row.mustChangePassword,
        })),
        total: Number(totalRow[0]?.value ?? 0),
        page,
        pageSize,
      };
    }

    case "overtime_requests": {
      const whereClause = pattern
        ? or(
            ilike(employees.code, pattern),
            ilike(employees.firstName, pattern),
            ilike(employees.lastName, pattern),
            ilike(overtimeRequests.reason, pattern),
          )
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db
          .select({ value: count() })
          .from(overtimeRequests)
          .innerJoin(employees, eq(overtimeRequests.employeeId, employees.id))
          .where(whereClause),
        db
          .select({
            id: overtimeRequests.id,
            employeeId: overtimeRequests.employeeId,
            employeeCode: employees.code,
            employeeFirstName: employees.firstName,
            employeeLastName: employees.lastName,
            startAt: overtimeRequests.startAt,
            endAt: overtimeRequests.endAt,
            reason: overtimeRequests.reason,
            statusCode: overtimeRequests.statusCode,
            statusName: requestStatuses.name,
            source: overtimeRequests.source,
            decisionNote: overtimeRequests.decisionNote,
          })
          .from(overtimeRequests)
          .innerJoin(employees, eq(overtimeRequests.employeeId, employees.id))
          .innerJoin(requestStatuses, eq(overtimeRequests.statusCode, requestStatuses.code))
          .where(whereClause)
          .orderBy(desc(overtimeRequests.startAt))
          .limit(pageSize)
          .offset(offset),
      ]);
      return {
        rows: rows.map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          employeeDisplay: `${row.employeeCode} · ${row.employeeFirstName} ${row.employeeLastName}`,
          startAt: formatBangkokDateTimeInput(row.startAt),
          startAtDisplay: formatBangkokDateTimeDisplay(row.startAt),
          endAt: formatBangkokDateTimeInput(row.endAt),
          endAtDisplay: formatBangkokDateTimeDisplay(row.endAt),
          reason: row.reason,
          statusCode: row.statusCode,
          statusName: row.statusName,
          source: row.source,
          decisionNote: row.decisionNote,
        })),
        total: Number(totalRow[0]?.value ?? 0),
        page,
        pageSize,
      };
    }

    case "leave_requests": {
      const whereClause = pattern
        ? or(
            ilike(employees.code, pattern),
            ilike(employees.firstName, pattern),
            ilike(employees.lastName, pattern),
            ilike(leaveRequests.reason, pattern),
          )
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db
          .select({ value: count() })
          .from(leaveRequests)
          .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
          .where(whereClause),
        db
          .select({
            id: leaveRequests.id,
            employeeId: leaveRequests.employeeId,
            employeeCode: employees.code,
            employeeFirstName: employees.firstName,
            employeeLastName: employees.lastName,
            leaveTypeCode: leaveRequests.leaveTypeCode,
            leaveTypeName: leaveTypes.name,
            startOn: leaveRequests.startOn,
            endOn: leaveRequests.endOn,
            session: leaveRequests.session,
            reason: leaveRequests.reason,
            statusCode: leaveRequests.statusCode,
            statusName: requestStatuses.name,
            decisionNote: leaveRequests.decisionNote,
          })
          .from(leaveRequests)
          .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
          .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeCode, leaveTypes.code))
          .innerJoin(requestStatuses, eq(leaveRequests.statusCode, requestStatuses.code))
          .where(whereClause)
          .orderBy(desc(leaveRequests.startOn))
          .limit(pageSize)
          .offset(offset),
      ]);
      return {
        rows: rows.map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          employeeDisplay: `${row.employeeCode} · ${row.employeeFirstName} ${row.employeeLastName}`,
          leaveTypeCode: row.leaveTypeCode,
          leaveTypeName: row.leaveTypeName,
          startOn: row.startOn,
          endOn: row.endOn,
          session: row.session,
          reason: row.reason,
          statusCode: row.statusCode,
          statusName: row.statusName,
          decisionNote: row.decisionNote,
        })),
        total: Number(totalRow[0]?.value ?? 0),
        page,
        pageSize,
      };
    }

    case "asset_requests": {
      const whereClause = pattern
        ? or(
            ilike(assetRequests.borrowerEmployeeCode, pattern),
            ilike(assetRequests.borrowerName, pattern),
            ilike(assetRequests.reason, pattern),
          )
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(assetRequests).where(whereClause),
        db
          .select({
            id: assetRequests.id,
            borrowerEmployeeCode: assetRequests.borrowerEmployeeCode,
            borrowerName: assetRequests.borrowerName,
            fromDate: assetRequests.fromDate,
            toDate: assetRequests.toDate,
            status: assetRequests.status,
            reason: assetRequests.reason,
            remarks: assetRequests.remarks,
          })
          .from(assetRequests)
          .where(whereClause)
          .orderBy(desc(assetRequests.createdAt))
          .limit(pageSize)
          .offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "work_tracking_records": {
      const whereClause = pattern
        ? or(
            ilike(workTrackingRecords.houseNo, pattern),
            ilike(workTrackingRecords.projectText, pattern),
            ilike(workTrackingRecords.detail, pattern),
          )
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(workTrackingRecords).where(whereClause),
        db
          .select({
            id: workTrackingRecords.id,
            houseNo: workTrackingRecords.houseNo,
            round: workTrackingRecords.round,
            eventDate: workTrackingRecords.eventDate,
            projectText: workTrackingRecords.projectText,
            detail: workTrackingRecords.detail,
            status: workTrackingRecords.status,
            deliveredDate: workTrackingRecords.deliveredDate,
          })
          .from(workTrackingRecords)
          .where(whereClause)
          .orderBy(desc(workTrackingRecords.eventDate), asc(workTrackingRecords.houseNo))
          .limit(pageSize)
          .offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "work_tracking_requests": {
      const whereClause = pattern
        ? or(
            ilike(workTrackingRequests.requestId, pattern),
            ilike(workTrackingRequests.houseNo, pattern),
            ilike(workTrackingRequests.projectShortName, pattern),
          )
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(workTrackingRequests).where(whereClause),
        db
          .select({
            requestId: workTrackingRequests.requestId,
            houseNo: workTrackingRequests.houseNo,
            round: workTrackingRequests.round,
            eventDate: workTrackingRequests.eventDate,
            workDate: workTrackingRequests.workDate,
            projectShortName: workTrackingRequests.projectShortName,
            developerNote: workTrackingRequests.developerNote,
            latestStatus: workTrackingRequests.latestStatus,
            latestAction: workTrackingRequests.latestAction,
            isOt: workTrackingRequests.isOt,
          })
          .from(workTrackingRequests)
          .where(whereClause)
          .orderBy(desc(workTrackingRequests.updatedAt))
          .limit(pageSize)
          .offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "work_tracking_activities": {
      const whereClause = pattern
        ? or(
            ilike(workTrackingActivities.activityId, pattern),
            ilike(workTrackingActivities.houseNo, pattern),
            ilike(workTrackingActivities.employeeName, pattern),
            ilike(workTrackingActivities.action, pattern),
          )
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(workTrackingActivities).where(whereClause),
        db
          .select({
            activityId: workTrackingActivities.activityId,
            houseNo: workTrackingActivities.houseNo,
            employeeName: workTrackingActivities.employeeName,
            workDate: workTrackingActivities.workDate,
            startTime: workTrackingActivities.startTime,
            endTime: workTrackingActivities.endTime,
            action: workTrackingActivities.action,
            status: workTrackingActivities.status,
            isOt: workTrackingActivities.isOt,
          })
          .from(workTrackingActivities)
          .where(whereClause)
          .orderBy(desc(workTrackingActivities.recordedAt))
          .limit(pageSize)
          .offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "employee_documents": {
      const whereClause = pattern
        ? or(
            ilike(employeeDocuments.fileName, pattern),
            ilike(employees.firstName, pattern),
            ilike(employees.code, pattern),
          )
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db
          .select({ value: count() })
          .from(employeeDocuments)
          .innerJoin(employees, eq(employeeDocuments.employeeId, employees.id))
          .where(whereClause),
        db
          .select({
            id: employeeDocuments.id,
            employeeCode: employees.code,
            employeeFirstName: employees.firstName,
            employeeLastName: employees.lastName,
            fileName: employeeDocuments.fileName,
            mimeType: employeeDocuments.mimeType,
            fileSize: employeeDocuments.fileSize,
          })
          .from(employeeDocuments)
          .innerJoin(employees, eq(employeeDocuments.employeeId, employees.id))
          .where(whereClause)
          .orderBy(desc(employeeDocuments.createdAt))
          .limit(pageSize)
          .offset(offset),
      ]);
      return {
        rows: rows.map((row) => ({
          id: row.id,
          employeeDisplay: `${row.employeeCode} · ${row.employeeFirstName} ${row.employeeLastName}`,
          fileName: row.fileName,
          mimeType: row.mimeType,
          fileSize: row.fileSize,
        })),
        total: Number(totalRow[0]?.value ?? 0),
        page,
        pageSize,
      };
    }

    case "departments": {
      const whereClause = pattern ? ilike(departments.name, pattern) : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(departments).where(whereClause),
        db.select({ id: departments.id, name: departments.name, isActive: departments.isActive })
          .from(departments).where(whereClause).orderBy(asc(departments.name)).limit(pageSize).offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "positions": {
      const whereClause = pattern ? ilike(positions.name, pattern) : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(positions).where(whereClause),
        db.select({ id: positions.id, name: positions.name, isActive: positions.isActive })
          .from(positions).where(whereClause).orderBy(asc(positions.name)).limit(pageSize).offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "employment_statuses": {
      const whereClause = pattern ? ilike(employmentStatuses.name, pattern) : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(employmentStatuses).where(whereClause),
        db.select({ id: employmentStatuses.id, name: employmentStatuses.name, isActive: employmentStatuses.isActive })
          .from(employmentStatuses).where(whereClause).orderBy(asc(employmentStatuses.id)).limit(pageSize).offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "employment_types": {
      const whereClause = pattern
        ? or(ilike(employmentTypes.code, pattern), ilike(employmentTypes.name, pattern))
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(employmentTypes).where(whereClause),
        db.select({ id: employmentTypes.id, code: employmentTypes.code, name: employmentTypes.name, isActive: employmentTypes.isActive })
          .from(employmentTypes).where(whereClause).orderBy(asc(employmentTypes.id)).limit(pageSize).offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "leave_types": {
      const whereClause = pattern ? or(ilike(leaveTypes.code, pattern), ilike(leaveTypes.name, pattern)) : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(leaveTypes).where(whereClause),
        db.select({
          code: leaveTypes.code,
          name: leaveTypes.name,
          description: leaveTypes.description,
          annualQuotaDays: leaveTypes.annualQuotaDays,
          quotaBasis: leaveTypes.quotaBasis,
          isActive: leaveTypes.isActive,
        }).from(leaveTypes).where(whereClause).orderBy(asc(leaveTypes.name)).limit(pageSize).offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "asset_agreement_templates": {
      const whereClause = pattern ? ilike(assetAgreementTemplates.title, pattern) : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(assetAgreementTemplates).where(whereClause),
        db.select({
          id: assetAgreementTemplates.id,
          title: assetAgreementTemplates.title,
          type: assetAgreementTemplates.type,
          isActive: assetAgreementTemplates.isActive,
        }).from(assetAgreementTemplates).where(whereClause).orderBy(desc(assetAgreementTemplates.updatedAt)).limit(pageSize).offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "asset_agreements": {
      const whereClause = pattern ? ilike(assetAgreements.title, pattern) : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(assetAgreements).where(whereClause),
        db.select({
          id: assetAgreements.id,
          title: assetAgreements.title,
          status: assetAgreements.status,
          documentDate: assetAgreements.documentDate,
        }).from(assetAgreements).where(whereClause).orderBy(desc(assetAgreements.documentDate)).limit(pageSize).offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "line_calendar_events": {
      const whereClause = pattern
        ? or(ilike(lineCalendarEvents.title, pattern), ilike(employees.firstName, pattern), ilike(employees.code, pattern))
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(lineCalendarEvents).innerJoin(employees, eq(lineCalendarEvents.employeeId, employees.id)).where(whereClause),
        db.select({
          id: lineCalendarEvents.id,
          employeeCode: employees.code,
          employeeFirstName: employees.firstName,
          employeeLastName: employees.lastName,
          title: lineCalendarEvents.title,
          status: lineCalendarEvents.status,
          startOn: lineCalendarEvents.startOn,
          endOn: lineCalendarEvents.endOn,
          location: lineCalendarEvents.location,
        })
          .from(lineCalendarEvents)
          .innerJoin(employees, eq(lineCalendarEvents.employeeId, employees.id))
          .where(whereClause)
          .orderBy(desc(lineCalendarEvents.createdAt))
          .limit(pageSize)
          .offset(offset),
      ]);
      return {
        rows: rows.map((row) => ({
          id: row.id,
          employeeDisplay: `${row.employeeCode} · ${row.employeeFirstName} ${row.employeeLastName}`,
          title: row.title,
          status: row.status,
          startOn: row.startOn,
          endOn: row.endOn,
          location: row.location,
        })),
        total: Number(totalRow[0]?.value ?? 0),
        page,
        pageSize,
      };
    }

    case "line_integration_jobs": {
      const whereClause = pattern
        ? or(ilike(lineIntegrationJobs.kind, pattern), ilike(lineIntegrationJobs.operationKey, pattern), ilike(lineIntegrationJobs.status, pattern))
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(lineIntegrationJobs).where(whereClause),
        db.select({
          id: lineIntegrationJobs.id,
          kind: lineIntegrationJobs.kind,
          operationKey: lineIntegrationJobs.operationKey,
          status: lineIntegrationJobs.status,
          attempts: lineIntegrationJobs.attempts,
          errorCode: lineIntegrationJobs.errorCode,
        }).from(lineIntegrationJobs).where(whereClause).orderBy(desc(lineIntegrationJobs.createdAt)).limit(pageSize).offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }

    case "line_bot_states": {
      const whereClause = pattern ? or(ilike(lineBotStates.lineUid, pattern), ilike(lineBotStates.step, pattern)) : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(lineBotStates).where(whereClause),
        db.select({
          lineUid: lineBotStates.lineUid,
          step: lineBotStates.step,
          linkAttempts: lineBotStates.linkAttempts,
          expiresAt: lineBotStates.expiresAt,
        }).from(lineBotStates).where(whereClause).orderBy(desc(lineBotStates.expiresAt)).limit(pageSize).offset(offset),
      ]);
      return {
        rows: rows.map((row) => ({
          ...row,
          expiresAt: formatBangkokDateTimeDisplay(row.expiresAt),
        })),
        total: Number(totalRow[0]?.value ?? 0),
        page,
        pageSize,
      };
    }

    case "line_webhook_events": {
      const whereClause = pattern
        ? or(ilike(lineWebhookEvents.eventId, pattern), ilike(lineWebhookEvents.status, pattern), ilike(lineWebhookEvents.errorCode, pattern))
        : undefined;
      const [totalRow, rows] = await Promise.all([
        db.select({ value: count() }).from(lineWebhookEvents).where(whereClause),
        db.select({
          eventId: lineWebhookEvents.eventId,
          sourceId: lineWebhookEvents.sourceId,
          status: lineWebhookEvents.status,
          attempts: lineWebhookEvents.attempts,
          errorCode: lineWebhookEvents.errorCode,
        }).from(lineWebhookEvents).where(whereClause).orderBy(desc(lineWebhookEvents.createdAt)).limit(pageSize).offset(offset),
      ]);
      return { rows, total: Number(totalRow[0]?.value ?? 0), page, pageSize };
    }
  }
}

async function fetchSingleAdminRow(tableKey: AdminTableKey, id: string): Promise<Record<string, unknown>> {
  const { rows } = await listAdminRows(tableKey, { page: 1, pageSize: 100 });
  const pk = getAdminTableMeta(tableKey).primaryKey;
  const found = rows.find((row) => String(row[pk]) === id);
  if (!found) {
    // Fallback direct search if > 100 rows exist
    if (tableKey === "employees") {
      const [emp] = await db.select({ code: employees.code }).from(employees).where(eq(employees.id, id)).limit(1);
      if (emp) {
        const res = await listAdminRows(tableKey, { search: emp.code, page: 1, pageSize: 100 });
        const exact = res.rows.find((row) => String(row[pk]) === id);
        if (exact) return exact;
      }
    }
    return { [pk]: id };
  }
  return found;
}

export async function createAdminRow(
  tableKey: AdminTableKey,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const meta = getAdminTableMeta(tableKey);
  if (!meta.creatable) {
    throw new AdminDataError(400, `ตาราง ${meta.label} ไม่รองรับการสร้างรายการใหม่จากหน้านี้`);
  }

  try {
    switch (tableKey) {
      case "employees": {
        const code = assertNonEmptyText(payload.code, "รหัสพนักงาน");
        if (code.length !== 4) throw new AdminDataError(400, "รหัสพนักงานต้องมี 4 ตัวอักษร/ตัวเลข");
        const firstName = assertNonEmptyText(payload.firstName, "ชื่อ");
        const lastName = assertNonEmptyText(payload.lastName, "นามสกุล");
        const startDate = parseRequiredDate(payload.startDate, "วันเริ่มงาน");
        const endDate = parseOptionalDate(payload.endDate, "วันสิ้นสุดงาน");
        if (endDate && endDate < startDate) throw new AdminDataError(400, "วันสิ้นสุดงานต้องไม่น้อยกว่าวันเริ่มงาน");
        const emailRaw = parseOptionalText(payload.email);
        const email = emailRaw ? emailRaw.toLowerCase() : null;
        if (email && !EMAIL_REGEX.test(email)) throw new AdminDataError(400, "รูปแบบอีเมลไม่ถูกต้อง");
        const baseSalary = parseOptionalNumber(payload.baseSalary, "ฐานเงินเดือน");
        if (baseSalary !== null && baseSalary < 0) throw new AdminDataError(400, "ฐานเงินเดือนต้องไม่ติดลบ");

        const [inserted] = await db.insert(employees).values({
          code,
          prefix: parseOptionalText(payload.prefix),
          firstName,
          lastName,
          nickname: parseOptionalText(payload.nickname),
          email,
          phone: parseOptionalText(payload.phone),
          citizenId: parseOptionalText(payload.citizenId),
          lineUid: parseOptionalText(payload.lineUid),
          startDate,
          endDate,
          baseSalary,
          departmentId: parseOptionalSelectInt(payload.departmentId, "แผนก"),
          positionId: parseOptionalSelectInt(payload.positionId, "ตำแหน่ง"),
          employmentStatusId: parseOptionalSelectInt(payload.employmentStatusId, "สถานะการทำงาน"),
          employmentTypeId: parseOptionalSelectInt(payload.employmentTypeId, "ประเภทการจ้าง"),
        }).returning({ id: employees.id });

        return fetchSingleAdminRow("employees", inserted.id);
      }

      case "users": {
        const employeeId = assertUuid(payload.employeeId, "พนักงาน");
        const email = assertNonEmptyText(payload.email, "อีเมล").toLowerCase();
        if (!EMAIL_REGEX.test(email)) throw new AdminDataError(400, "รูปแบบอีเมลไม่ถูกต้อง");
        if (!isRole(payload.role)) throw new AdminDataError(400, "บทบาทต้องเป็น employee, hr หรือ executive");
        const password = typeof payload.newPassword === "string" ? payload.newPassword : "";
        if (!password.length) throw new AdminDataError(400, "กรุณาระบุรหัสผ่านสำหรับบัญชีใหม่");
        const isActive = payload.isActive === undefined ? true : parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const mustChangePassword = payload.mustChangePassword === undefined ? true : parseRequiredBoolean(payload.mustChangePassword, "บังคับเปลี่ยนรหัสครั้งแรก");

        const [passwordHash, permissions] = await Promise.all([
          hashPassword(password),
          getStoredPermissionsForRole(payload.role),
        ]);

        const [inserted] = await db.insert(users).values({
          employeeId,
          email,
          role: payload.role,
          passwordHash,
          permissions,
          isActive,
          mustChangePassword,
        }).returning({ id: users.id });

        return fetchSingleAdminRow("users", inserted.id);
      }

      case "overtime_requests": {
        const employeeId = assertUuid(payload.employeeId, "พนักงาน");
        const startAt = parseBangkokDateTime(payload.startAt, "เวลาเริ่ม");
        const endAt = parseBangkokDateTime(payload.endAt, "เวลาสิ้นสุด");
        if (endAt <= startAt) throw new AdminDataError(400, "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม");
        const reason = assertNonEmptyText(payload.reason, "รายละเอียดงาน");
        const statusCode = assertNonEmptyText(payload.statusCode, "สถานะ");
        const source = assertNonEmptyText(payload.source ?? "hrm", "แหล่งที่มา");
        if (!OVERTIME_SOURCE_SET.has(source)) throw new AdminDataError(400, "แหล่งที่มาไม่ถูกต้อง");

        const [inserted] = await db.insert(overtimeRequests).values({
          employeeId,
          startAt,
          endAt,
          reason,
          statusCode,
          source,
          decisionNote: parseOptionalText(payload.decisionNote),
        }).returning({ id: overtimeRequests.id });

        return fetchSingleAdminRow("overtime_requests", inserted.id);
      }

      case "leave_requests": {
        const employeeId = assertUuid(payload.employeeId, "พนักงาน");
        const leaveTypeCode = assertNonEmptyText(payload.leaveTypeCode, "ประเภทการลา");
        const startOn = parseRequiredDate(payload.startOn, "ตั้งแต่วันที่");
        const endOn = parseRequiredDate(payload.endOn, "ถึงวันที่");
        if (endOn < startOn) throw new AdminDataError(400, "วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม");
        const session = assertNonEmptyText(payload.session ?? "full", "ช่วงเวลา");
        if (!LEAVE_SESSION_SET.has(session)) throw new AdminDataError(400, "ช่วงเวลาการลาไม่ถูกต้อง");
        if (session !== "full" && startOn !== endOn) {
          throw new AdminDataError(400, "การลาครึ่งวันต้องมีวันที่เริ่มและวันที่สิ้นสุดเป็นวันเดียวกัน");
        }
        const statusCode = assertNonEmptyText(payload.statusCode, "สถานะ");

        const [inserted] = await db.insert(leaveRequests).values({
          employeeId,
          leaveTypeCode,
          startOn,
          endOn,
          session,
          reason: parseOptionalText(payload.reason),
          statusCode,
          decisionNote: parseOptionalText(payload.decisionNote),
        }).returning({ id: leaveRequests.id });

        return fetchSingleAdminRow("leave_requests", inserted.id);
      }

      case "work_tracking_records": {
        const houseNo = assertNonEmptyText(payload.houseNo, "บ้านเลขที่/แปลง");
        const round = assertNonEmptyText(payload.round, "รอบตรวจ");
        const eventDate = parseRequiredDate(payload.eventDate, "วันที่ตรวจ");
        const status = assertNonEmptyText(payload.status ?? "in_progress", "สถานะ") as WorkTrackingRecordStatus;
        if (!WORK_STATUS_SET.has(status)) throw new AdminDataError(400, "สถานะไม่ถูกต้อง");
        const deliveredDate = parseOptionalDate(payload.deliveredDate, "วันที่ส่งมอบ");

        const [inserted] = await db.insert(workTrackingRecords).values({
          houseNo,
          round,
          eventDate,
          projectText: typeof payload.projectText === "string" ? payload.projectText.trim() : "",
          detail: typeof payload.detail === "string" ? payload.detail.trim() : "",
          status,
          deliveredDate,
        }).returning({ id: workTrackingRecords.id });

        return fetchSingleAdminRow("work_tracking_records", inserted.id);
      }

      case "departments": {
        const name = assertNonEmptyText(payload.name, "ชื่อแผนก");
        const isActive = payload.isActive === undefined ? true : parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const [inserted] = await db.insert(departments).values({ name, isActive }).returning({ id: departments.id });
        return fetchSingleAdminRow("departments", String(inserted.id));
      }

      case "positions": {
        const name = assertNonEmptyText(payload.name, "ชื่อตำแหน่ง");
        const isActive = payload.isActive === undefined ? true : parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const [inserted] = await db.insert(positions).values({ name, isActive }).returning({ id: positions.id });
        return fetchSingleAdminRow("positions", String(inserted.id));
      }

      case "employment_statuses": {
        const name = assertNonEmptyText(payload.name, "ชื่อสถานะพนักงาน");
        const isActive = payload.isActive === undefined ? true : parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const [inserted] = await db.insert(employmentStatuses).values({ name, isActive }).returning({ id: employmentStatuses.id });
        return fetchSingleAdminRow("employment_statuses", String(inserted.id));
      }

      case "employment_types": {
        const code = assertNonEmptyText(payload.code, "รหัส");
        const name = assertNonEmptyText(payload.name, "ชื่อประเภทการจ้างงาน");
        const isActive = payload.isActive === undefined ? true : parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const [inserted] = await db.insert(employmentTypes).values({ code, name, isActive }).returning({ id: employmentTypes.id });
        return fetchSingleAdminRow("employment_types", String(inserted.id));
      }

      case "leave_types": {
        const code = assertNonEmptyText(payload.code, "รหัสประเภทการลา");
        const name = assertNonEmptyText(payload.name, "ชื่อประเภทการลา");
        const annualQuotaDays = parseOptionalInt(payload.annualQuotaDays, "โควตาต่อปี");
        const quotaBasis = assertNonEmptyText(payload.quotaBasis ?? "fixed", "เกณฑ์คำนวณโควตา");
        if (!QUOTA_BASIS_SET.has(quotaBasis)) throw new AdminDataError(400, "เกณฑ์คำนวณโควตาไม่ถูกต้อง");
        const isActive = payload.isActive === undefined ? true : parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const [inserted] = await db.insert(leaveTypes).values({
          code,
          name,
          description: parseOptionalText(payload.description),
          annualQuotaDays,
          quotaBasis,
          isActive,
        }).returning({ code: leaveTypes.code });
        return fetchSingleAdminRow("leave_types", inserted.code);
      }

      default:
        throw new AdminDataError(400, `ตาราง ${meta.label} ไม่รองรับการสร้างรายการใหม่`);
    }
  } catch (error) {
    handleDbError(error);
  }
}

export async function updateAdminRow(
  tableKey: AdminTableKey,
  rawId: string,
  payload: Record<string, unknown>,
  actor: SessionPayload,
): Promise<Record<string, unknown>> {
  const meta = getAdminTableMeta(tableKey);
  if (!meta.editable) {
    throw new AdminDataError(400, `ตาราง ${meta.label} ไม่รองรับการแก้ไขจากหน้านี้`);
  }

  const now = new Date();

  try {
    switch (tableKey) {
      case "employees": {
        const id = assertUuid(rawId);
        const [existing] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
        if (!existing) throw new AdminDataError(404, "ไม่พบข้อมูลพนักงาน");

        const code = assertNonEmptyText(payload.code, "รหัสพนักงาน");
        if (code.length !== 4) throw new AdminDataError(400, "รหัสพนักงานต้องมี 4 ตัวอักษร/ตัวเลข");
        const firstName = assertNonEmptyText(payload.firstName, "ชื่อ");
        const lastName = assertNonEmptyText(payload.lastName, "นามสกุล");
        const startDate = parseRequiredDate(payload.startDate, "วันเริ่มงาน");
        const endDate = parseOptionalDate(payload.endDate, "วันสิ้นสุดงาน");
        if (endDate && endDate < startDate) throw new AdminDataError(400, "วันสิ้นสุดงานต้องไม่น้อยกว่าวันเริ่มงาน");
        const emailRaw = parseOptionalText(payload.email);
        const email = emailRaw ? emailRaw.toLowerCase() : null;
        if (email && !EMAIL_REGEX.test(email)) throw new AdminDataError(400, "รูปแบบอีเมลไม่ถูกต้อง");
        const baseSalary = parseOptionalNumber(payload.baseSalary, "ฐานเงินเดือน");
        if (baseSalary !== null && baseSalary < 0) throw new AdminDataError(400, "ฐานเงินเดือนต้องไม่ติดลบ");
        const nextIsActive = payload.isActive === undefined
          ? existing.deletedAt === null
          : parseRequiredBoolean(payload.isActive, "สถานะปฏิบัติงาน");

        await db.transaction(async (tx) => {
          await tx.update(employees).set({
            code,
            prefix: parseOptionalText(payload.prefix),
            firstName,
            lastName,
            nickname: parseOptionalText(payload.nickname),
            email,
            phone: parseOptionalText(payload.phone),
            citizenId: parseOptionalText(payload.citizenId),
            lineUid: parseOptionalText(payload.lineUid),
            startDate,
            endDate,
            baseSalary,
            departmentId: parseOptionalSelectInt(payload.departmentId, "แผนก"),
            positionId: parseOptionalSelectInt(payload.positionId, "ตำแหน่ง"),
            employmentStatusId: parseOptionalSelectInt(payload.employmentStatusId, "สถานะการทำงาน"),
            employmentTypeId: parseOptionalSelectInt(payload.employmentTypeId, "ประเภทการจ้าง"),
            deletedAt: nextIsActive ? null : (existing.deletedAt ?? now),
            updatedAt: now,
          }).where(eq(employees.id, id));

          if (email) {
            const [linkedUser] = await tx.select({ id: users.id }).from(users).where(eq(users.employeeId, id)).limit(1);
            if (linkedUser) {
              await tx.update(users).set({ email, updatedAt: now }).where(eq(users.id, linkedUser.id));
            }
          }
        });

        return fetchSingleAdminRow("employees", id);
      }

      case "users": {
        const id = assertUuid(rawId);
        const email = assertNonEmptyText(payload.email, "อีเมล").toLowerCase();
        if (!EMAIL_REGEX.test(email)) throw new AdminDataError(400, "รูปแบบอีเมลไม่ถูกต้อง");
        if (!isRole(payload.role)) throw new AdminDataError(400, "บทบาทต้องเป็น employee, hr หรือ executive");
        const nextIsActive = parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const mustChangePassword = parseRequiredBoolean(payload.mustChangePassword, "บังคับเปลี่ยนรหัสครั้งแรก");
        const rawNewPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
        const nextPasswordHash = rawNewPassword.length > 0 ? await hashPassword(rawNewPassword) : null;

        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(74821931)`);
          const activeAccounts = await tx
            .select({ id: users.id, permissions: users.permissions })
            .from(users)
            .where(eq(users.isActive, true));
          const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
          if (!target) throw new AdminDataError(404, "ไม่พบบัญชีผู้ใช้");

          if (!nextIsActive && !isSystemAdminSession(actor)) {
            if (actor.sub === id) {
              throw new AdminDataError(409, "ไม่สามารถปิดใช้งานบัญชีที่กำลังเข้าสู่ระบบอยู่ได้");
            }
            const remainingActiveManagers = activeAccounts.some(
              (acc) => acc.id !== id && hasPermission(acc.permissions, "users.permissions.manage"),
            );
            const targetIsActiveManager = activeAccounts.some(
              (acc) => acc.id === id && hasPermission(acc.permissions, "users.permissions.manage"),
            );
            if (targetIsActiveManager && !remainingActiveManagers) {
              throw new AdminDataError(409, "ต้องมีบัญชีผู้ดูแลสิทธิ์ที่ใช้งานอยู่อย่างน้อย 1 บัญชี");
            }
          }

          await tx.update(users).set({
            email,
            role: normalizeRole(payload.role),
            isActive: nextIsActive,
            mustChangePassword,
            ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {}),
            updatedAt: now,
          }).where(eq(users.id, id));
        });

        return fetchSingleAdminRow("users", id);
      }

      case "overtime_requests": {
        const id = assertUuid(rawId);
        const employeeId = assertUuid(payload.employeeId, "พนักงาน");
        const startAt = parseBangkokDateTime(payload.startAt, "เวลาเริ่ม");
        const endAt = parseBangkokDateTime(payload.endAt, "เวลาสิ้นสุด");
        if (endAt <= startAt) throw new AdminDataError(400, "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม");
        const reason = assertNonEmptyText(payload.reason, "รายละเอียดงาน");
        const statusCode = assertNonEmptyText(payload.statusCode, "สถานะ");
        const source = assertNonEmptyText(payload.source, "แหล่งที่มา");
        if (!OVERTIME_SOURCE_SET.has(source)) throw new AdminDataError(400, "แหล่งที่มาไม่ถูกต้อง");

        const [updated] = await db.update(overtimeRequests).set({
          employeeId,
          startAt,
          endAt,
          reason,
          statusCode,
          source,
          decisionNote: parseOptionalText(payload.decisionNote),
          updatedAt: now,
        }).where(eq(overtimeRequests.id, id)).returning({ id: overtimeRequests.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบคำขอ OT");
        return fetchSingleAdminRow("overtime_requests", id);
      }

      case "leave_requests": {
        const id = assertUuid(rawId);
        const employeeId = assertUuid(payload.employeeId, "พนักงาน");
        const leaveTypeCode = assertNonEmptyText(payload.leaveTypeCode, "ประเภทการลา");
        const startOn = parseRequiredDate(payload.startOn, "ตั้งแต่วันที่");
        const endOn = parseRequiredDate(payload.endOn, "ถึงวันที่");
        if (endOn < startOn) throw new AdminDataError(400, "วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม");
        const session = assertNonEmptyText(payload.session, "ช่วงเวลา");
        if (!LEAVE_SESSION_SET.has(session)) throw new AdminDataError(400, "ช่วงเวลาการลาไม่ถูกต้อง");
        if (session !== "full" && startOn !== endOn) {
          throw new AdminDataError(400, "การลาครึ่งวันต้องมีวันที่เริ่มและวันที่สิ้นสุดเป็นวันเดียวกัน");
        }
        const statusCode = assertNonEmptyText(payload.statusCode, "สถานะ");

        const [updated] = await db.update(leaveRequests).set({
          employeeId,
          leaveTypeCode,
          startOn,
          endOn,
          session,
          reason: parseOptionalText(payload.reason),
          statusCode,
          decisionNote: parseOptionalText(payload.decisionNote),
          updatedAt: now,
        }).where(eq(leaveRequests.id, id)).returning({ id: leaveRequests.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบคำขอวันลา");
        return fetchSingleAdminRow("leave_requests", id);
      }

      case "asset_requests": {
        const id = assertUuid(rawId);
        const fromDate = parseRequiredDate(payload.fromDate, "วันที่เริ่มยืม");
        const toDate = parseOptionalDate(payload.toDate, "วันที่คืน");
        if (toDate && toDate < fromDate) throw new AdminDataError(400, "วันที่คืนต้องไม่น้อยกว่าวันที่เริ่มยืม");
        const status = assertNonEmptyText(payload.status, "สถานะ");
        if (!ASSET_STATUS_SET.has(status)) throw new AdminDataError(400, "สถานะคำขอทรัพย์สินไม่ถูกต้อง");

        const [updated] = await db.update(assetRequests).set({
          fromDate,
          toDate,
          status: status as typeof assetRequests.$inferInsert.status,
          reason: typeof payload.reason === "string" ? payload.reason : "",
          remarks: typeof payload.remarks === "string" ? payload.remarks : "",
          updatedAt: now,
        }).where(eq(assetRequests.id, id)).returning({ id: assetRequests.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบคำขอยืมทรัพย์สิน");
        return fetchSingleAdminRow("asset_requests", id);
      }

      case "work_tracking_records": {
        const id = assertUuid(rawId);
        const houseNo = assertNonEmptyText(payload.houseNo, "บ้านเลขที่/แปลง");
        const round = assertNonEmptyText(payload.round, "รอบตรวจ");
        const eventDate = parseRequiredDate(payload.eventDate, "วันที่ตรวจ");
        const status = assertNonEmptyText(payload.status, "สถานะ") as WorkTrackingRecordStatus;
        if (!WORK_STATUS_SET.has(status)) throw new AdminDataError(400, "สถานะไม่ถูกต้อง");
        const deliveredDate = parseOptionalDate(payload.deliveredDate, "วันที่ส่งมอบ");

        const [updated] = await db.update(workTrackingRecords).set({
          houseNo,
          round,
          eventDate,
          projectText: typeof payload.projectText === "string" ? payload.projectText.trim() : "",
          detail: typeof payload.detail === "string" ? payload.detail.trim() : "",
          status,
          deliveredDate,
          updatedAt: now,
        }).where(eq(workTrackingRecords.id, id)).returning({ id: workTrackingRecords.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบบันทึกติดตามงาน");
        return fetchSingleAdminRow("work_tracking_records", id);
      }

      case "work_tracking_requests": {
        const requestId = assertNonEmptyText(rawId, "Request ID");
        const houseNo = assertNonEmptyText(payload.houseNo, "บ้านเลขที่");
        const round = assertNonEmptyText(payload.round, "รอบ");
        const eventDate = parseRequiredDate(payload.eventDate, "Event Date");
        const workDate = parseRequiredDate(payload.workDate, "วันที่ทำงาน");
        const latestStatus = assertNonEmptyText(payload.latestStatus, "สถานะล่าสุด") as WorkTrackingRecordStatus;
        if (!WORK_STATUS_SET.has(latestStatus)) throw new AdminDataError(400, "สถานะไม่ถูกต้อง");
        const isOt = parseRequiredBoolean(payload.isOt, "เป็นงาน OT");

        const [updated] = await db.update(workTrackingRequests).set({
          houseNo,
          round,
          eventDate,
          workDate,
          projectShortName: typeof payload.projectShortName === "string" ? payload.projectShortName.trim() : "",
          developerNote: typeof payload.developerNote === "string" ? payload.developerNote.trim() : "",
          latestStatus,
          latestAction: typeof payload.latestAction === "string" ? payload.latestAction.trim() : "",
          isOt,
          updatedAt: now,
        }).where(eq(workTrackingRequests.requestId, requestId)).returning({ requestId: workTrackingRequests.requestId });
        if (!updated) throw new AdminDataError(404, "ไม่พบคำขอติดตามงาน LINE");
        return fetchSingleAdminRow("work_tracking_requests", requestId);
      }

      case "work_tracking_activities": {
        const activityId = assertNonEmptyText(rawId, "Activity ID");
        const workDate = parseRequiredDate(payload.workDate, "วันที่ทำงาน");
        const startTime = assertNonEmptyText(payload.startTime, "เวลาเริ่ม");
        const endTime = assertNonEmptyText(payload.endTime, "เวลาสิ้นสุด");
        const status = assertNonEmptyText(payload.status, "สถานะ") as WorkTrackingRecordStatus;
        if (!WORK_STATUS_SET.has(status)) throw new AdminDataError(400, "สถานะไม่ถูกต้อง");
        const isOt = parseRequiredBoolean(payload.isOt, "งาน OT");

        const [updated] = await db.update(workTrackingActivities).set({
          workDate,
          startTime,
          endTime,
          action: typeof payload.action === "string" ? payload.action.trim() : "",
          status,
          isOt,
        }).where(eq(workTrackingActivities.activityId, activityId)).returning({ activityId: workTrackingActivities.activityId });
        if (!updated) throw new AdminDataError(404, "ไม่พบกิจกรรมติดตามงาน");
        return fetchSingleAdminRow("work_tracking_activities", activityId);
      }

      case "employee_documents": {
        const id = assertUuid(rawId);
        const fileName = assertNonEmptyText(payload.fileName, "ชื่อไฟล์");
        const [updated] = await db.update(employeeDocuments).set({ fileName }).where(eq(employeeDocuments.id, id)).returning({ id: employeeDocuments.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบเอกสารพนักงาน");
        return fetchSingleAdminRow("employee_documents", id);
      }

      case "departments": {
        const id = assertPositiveInt(rawId);
        const name = assertNonEmptyText(payload.name, "ชื่อแผนก");
        const isActive = parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const [updated] = await db.update(departments).set({ name, isActive, updatedAt: now }).where(eq(departments.id, id)).returning({ id: departments.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบแผนก");
        return fetchSingleAdminRow("departments", String(id));
      }

      case "positions": {
        const id = assertPositiveInt(rawId);
        const name = assertNonEmptyText(payload.name, "ชื่อตำแหน่ง");
        const isActive = parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const [updated] = await db.update(positions).set({ name, isActive, updatedAt: now }).where(eq(positions.id, id)).returning({ id: positions.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบตำแหน่ง");
        return fetchSingleAdminRow("positions", String(id));
      }

      case "employment_statuses": {
        const id = assertPositiveInt(rawId);
        const name = assertNonEmptyText(payload.name, "ชื่อสถานะพนักงาน");
        const isActive = parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const [updated] = await db.update(employmentStatuses).set({ name, isActive }).where(eq(employmentStatuses.id, id)).returning({ id: employmentStatuses.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบสถานะพนักงาน");
        return fetchSingleAdminRow("employment_statuses", String(id));
      }

      case "employment_types": {
        const id = assertPositiveInt(rawId);
        const code = assertNonEmptyText(payload.code, "รหัส");
        const name = assertNonEmptyText(payload.name, "ชื่อประเภทการจ้างงาน");
        const isActive = parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const [updated] = await db.update(employmentTypes).set({ code, name, isActive }).where(eq(employmentTypes.id, id)).returning({ id: employmentTypes.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบประเภทการจ้างงาน");
        return fetchSingleAdminRow("employment_types", String(id));
      }

      case "leave_types": {
        const code = assertNonEmptyText(rawId, "รหัสประเภทการลา");
        const name = assertNonEmptyText(payload.name, "ชื่อประเภทการลา");
        const annualQuotaDays = parseOptionalInt(payload.annualQuotaDays, "โควตาต่อปี");
        const quotaBasis = assertNonEmptyText(payload.quotaBasis, "เกณฑ์คำนวณโควตา");
        if (!QUOTA_BASIS_SET.has(quotaBasis)) throw new AdminDataError(400, "เกณฑ์คำนวณโควตาไม่ถูกต้อง");
        const isActive = parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");

        const [updated] = await db.update(leaveTypes).set({
          name,
          description: parseOptionalText(payload.description),
          annualQuotaDays,
          quotaBasis,
          isActive,
        }).where(eq(leaveTypes.code, code)).returning({ code: leaveTypes.code });
        if (!updated) throw new AdminDataError(404, "ไม่พบประเภทการลา");
        return fetchSingleAdminRow("leave_types", code);
      }

      case "asset_agreement_templates": {
        const id = assertUuid(rawId);
        const title = assertNonEmptyText(payload.title, "ชื่อแม่แบบ");
        const type = assertNonEmptyText(payload.type, "ประเภท") as "borrow" | "asset_form";
        if (!AGREEMENT_TYPE_SET.has(type)) throw new AdminDataError(400, "ประเภทแม่แบบไม่ถูกต้อง");
        const isActive = parseRequiredBoolean(payload.isActive, "เปิดใช้งาน");
        const [updated] = await db.update(assetAgreementTemplates).set({ title, type, isActive, updatedAt: now }).where(eq(assetAgreementTemplates.id, id)).returning({ id: assetAgreementTemplates.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบแม่แบบสัญญา");
        return fetchSingleAdminRow("asset_agreement_templates", id);
      }

      case "asset_agreements": {
        const id = assertUuid(rawId);
        const title = assertNonEmptyText(payload.title, "ชื่อสัญญา");
        const status = assertNonEmptyText(payload.status, "สถานะสัญญา") as "waiting_handover" | "waiting_employee" | "waiting_admin" | "completed";
        if (!AGREEMENT_STATUS_SET.has(status)) throw new AdminDataError(400, "สถานะสัญญาไม่ถูกต้อง");
        const documentDate = parseRequiredDate(payload.documentDate, "วันที่เอกสาร");
        const [updated] = await db.update(assetAgreements).set({ title, status, documentDate, updatedAt: now }).where(eq(assetAgreements.id, id)).returning({ id: assetAgreements.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบเอกสารสัญญา");
        return fetchSingleAdminRow("asset_agreements", id);
      }

      case "line_calendar_events": {
        const id = assertUuid(rawId);
        const title = assertNonEmptyText(payload.title, "หัวข้อกิจกรรม");
        const status = assertNonEmptyText(payload.status, "สถานะ");
        const startOn = parseOptionalDate(payload.startOn, "วันเริ่ม");
        const endOn = parseOptionalDate(payload.endOn, "วันสิ้นสุด");
        const [updated] = await db.update(lineCalendarEvents).set({
          title,
          status,
          startOn,
          endOn,
          location: parseOptionalText(payload.location),
        }).where(eq(lineCalendarEvents.id, id)).returning({ id: lineCalendarEvents.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบกิจกรรมปฏิทิน LINE");
        return fetchSingleAdminRow("line_calendar_events", id);
      }

      case "line_integration_jobs": {
        const id = assertUuid(rawId);
        const status = assertNonEmptyText(payload.status, "สถานะ");
        const attempts = parseOptionalInt(payload.attempts, "จำนวนครั้ง");
        if (attempts === null || attempts < 0) throw new AdminDataError(400, "จำนวนครั้งต้องเป็น 0 หรือมากกว่า");
        const [updated] = await db.update(lineIntegrationJobs).set({
          status,
          attempts,
          errorCode: parseOptionalText(payload.errorCode),
          updatedAt: now,
        }).where(eq(lineIntegrationJobs.id, id)).returning({ id: lineIntegrationJobs.id });
        if (!updated) throw new AdminDataError(404, "ไม่พบคิวงาน LINE Integration");
        return fetchSingleAdminRow("line_integration_jobs", id);
      }

      default:
        throw new AdminDataError(400, `ตาราง ${meta.label} ไม่รองรับการแก้ไข`);
    }
  } catch (error) {
    handleDbError(error);
  }
}

export type DeleteImpactItem = {
  label: string;
  count: number;
  action: "delete" | "unlink";
};

export type DeleteImpactSummary = {
  table: AdminTableKey;
  id: string;
  label: string;
  confirmText: string | null;
  impacts: DeleteImpactItem[];
};

export async function getDeleteImpact(tableKey: AdminTableKey, rawId: string): Promise<DeleteImpactSummary> {
  switch (tableKey) {
    case "employees": {
      const id = assertUuid(rawId);
      const [emp] = await db
        .select({ id: employees.id, code: employees.code, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.id, id))
        .limit(1);
      if (!emp) throw new AdminDataError(404, "ไม่พบข้อมูลพนักงาน");

      const [
        usersRows,
        otRows,
        leaveRows,
        assetRows,
        docRows,
        calRows,
        subordinatesRows,
        otDecidedRows,
        leaveDecidedRows,
      ] = await Promise.all([
        db.select({ value: count() }).from(users).where(eq(users.employeeId, id)),
        db.select({ value: count() }).from(overtimeRequests).where(eq(overtimeRequests.employeeId, id)),
        db.select({ value: count() }).from(leaveRequests).where(eq(leaveRequests.employeeId, id)),
        db.select({ value: count() }).from(assetRequests).where(eq(assetRequests.borrowerEmployeeId, id)),
        db.select({ value: count() }).from(employeeDocuments).where(eq(employeeDocuments.employeeId, id)),
        db.select({ value: count() }).from(lineCalendarEvents).where(eq(lineCalendarEvents.employeeId, id)),
        db.select({ value: count() }).from(employees).where(eq(employees.managerId, id)),
        db.select({ value: count() }).from(overtimeRequests).where(or(eq(overtimeRequests.decidedByEmployeeId, id), eq(overtimeRequests.cancelledByEmployeeId, id))),
        db.select({ value: count() }).from(leaveRequests).where(or(eq(leaveRequests.decidedByEmployeeId, id), eq(leaveRequests.cancelledByEmployeeId, id))),
      ]);

      const impacts: DeleteImpactItem[] = [
        { label: "บัญชีผู้ใช้ (users)", count: Number(usersRows[0]?.value ?? 0), action: "delete" as const },
        { label: "คำขอ OT ของพนักงาน", count: Number(otRows[0]?.value ?? 0), action: "delete" as const },
        { label: "คำขอวันลาของพนักงาน", count: Number(leaveRows[0]?.value ?? 0), action: "delete" as const },
        { label: "คำขอยืมทรัพย์สินของพนักงาน", count: Number(assetRows[0]?.value ?? 0), action: "delete" as const },
        { label: "เอกสารพนักงานในฐานข้อมูล", count: Number(docRows[0]?.value ?? 0), action: "delete" as const },
        { label: "กิจกรรมปฏิทิน LINE", count: Number(calRows[0]?.value ?? 0), action: "delete" as const },
        { label: "ลูกทีมที่อ้างอิงเป็นหัวหน้า (ปลดการผูกหัวหน้า)", count: Number(subordinatesRows[0]?.value ?? 0), action: "unlink" as const },
        { label: "ประวัติการอนุมัติคำขอ OT/วันลา (ล้างชื่อผู้อนุมัติ)", count: Number(otDecidedRows[0]?.value ?? 0) + Number(leaveDecidedRows[0]?.value ?? 0), action: "unlink" as const },
      ].filter((item) => item.count > 0);

      return {
        table: tableKey,
        id,
        label: `${emp.code} · ${emp.firstName} ${emp.lastName}`,
        confirmText: emp.code,
        impacts,
      };
    }

    case "leave_requests": {
      const id = assertUuid(rawId);
      const [row] = await db.select({ id: leaveRequests.id, startOn: leaveRequests.startOn, endOn: leaveRequests.endOn }).from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
      if (!row) throw new AdminDataError(404, "ไม่พบคำขอวันลา");
      const [calRow] = await db.select({ value: count() }).from(lineCalendarEvents).where(eq(lineCalendarEvents.leaveRequestId, id));
      return {
        table: tableKey,
        id,
        label: `คำขอวันลา ${row.startOn} ถึง ${row.endOn}`,
        confirmText: null,
        impacts: Number(calRow?.value ?? 0) > 0
          ? [{ label: "กิจกรรมปฏิทิน LINE ที่เชื่อมกับคำขอลานี้", count: Number(calRow.value), action: "delete" }]
          : [],
      };
    }

    case "asset_requests": {
      const id = assertUuid(rawId);
      const [row] = await db.select({ id: assetRequests.id, borrowerName: assetRequests.borrowerName, fromDate: assetRequests.fromDate }).from(assetRequests).where(eq(assetRequests.id, id)).limit(1);
      if (!row) throw new AdminDataError(404, "ไม่พบคำขอยืมทรัพย์สิน");
      const [itemRow, attRow, evtRow] = await Promise.all([
        db.select({ value: count() }).from(assetRequestItems).where(eq(assetRequestItems.requestId, id)),
        db.select({ value: count() }).from(assetRequestAttachments).where(eq(assetRequestAttachments.requestId, id)),
        db.select({ value: count() }).from(assetRequestEvents).where(eq(assetRequestEvents.requestId, id)),
      ]);
      const impacts: DeleteImpactItem[] = [
        { label: "รายการสิ่งของในคำขอ", count: Number(itemRow[0]?.value ?? 0), action: "delete" as const },
        { label: "ไฟล์แนบคำขอ", count: Number(attRow[0]?.value ?? 0), action: "delete" as const },
        { label: "ประวัติเหตุการณ์คำขอ (events)", count: Number(evtRow[0]?.value ?? 0), action: "delete" as const },
      ].filter((item) => item.count > 0);
      return {
        table: tableKey,
        id,
        label: `คำขอยืมทรัพย์สิน · ${row.borrowerName} (${row.fromDate})`,
        confirmText: null,
        impacts,
      };
    }

    case "work_tracking_requests": {
      const id = assertNonEmptyText(rawId, "Request ID");
      const [row] = await db.select({ requestId: workTrackingRequests.requestId, houseNo: workTrackingRequests.houseNo }).from(workTrackingRequests).where(eq(workTrackingRequests.requestId, id)).limit(1);
      if (!row) throw new AdminDataError(404, "ไม่พบคำขอติดตามงาน LINE");
      const [actRow] = await db.select({ value: count() }).from(workTrackingActivities).where(eq(workTrackingActivities.requestId, id));
      return {
        table: tableKey,
        id,
        label: `${row.requestId} (${row.houseNo})`,
        confirmText: null,
        impacts: Number(actRow?.value ?? 0) > 0
          ? [{ label: "กิจกรรมย่อยภายใต้คำขอนี้", count: Number(actRow.value), action: "delete" }]
          : [],
      };
    }

    default: {
      const row = await fetchSingleAdminRow(tableKey, rawId);
      const pk = getAdminTableMeta(tableKey).primaryKey;
      const existsInDb = await checkRowExists(tableKey, rawId);
      if (!existsInDb) throw new AdminDataError(404, "ไม่พบรายการที่ต้องการลบ");
      const labelCandidate = row.name ?? row.title ?? row.email ?? row.houseNo ?? row.fileName ?? row.lineUid ?? row.eventId ?? row[pk];
      return {
        table: tableKey,
        id: rawId,
        label: String(labelCandidate ?? rawId),
        confirmText: null,
        impacts: [],
      };
    }
  }
}

async function checkRowExists(tableKey: AdminTableKey, rawId: string): Promise<boolean> {
  switch (tableKey) {
    case "users": {
      const id = assertUuid(rawId);
      return (await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)).length > 0;
    }
    case "overtime_requests": {
      const id = assertUuid(rawId);
      return (await db.select({ id: overtimeRequests.id }).from(overtimeRequests).where(eq(overtimeRequests.id, id)).limit(1)).length > 0;
    }
    case "work_tracking_records": {
      const id = assertUuid(rawId);
      return (await db.select({ id: workTrackingRecords.id }).from(workTrackingRecords).where(eq(workTrackingRecords.id, id)).limit(1)).length > 0;
    }
    case "work_tracking_activities": {
      const id = assertNonEmptyText(rawId, "Activity ID");
      return (await db.select({ id: workTrackingActivities.activityId }).from(workTrackingActivities).where(eq(workTrackingActivities.activityId, id)).limit(1)).length > 0;
    }
    case "employee_documents": {
      const id = assertUuid(rawId);
      return (await db.select({ id: employeeDocuments.id }).from(employeeDocuments).where(eq(employeeDocuments.id, id)).limit(1)).length > 0;
    }
    case "departments": {
      const id = assertPositiveInt(rawId);
      return (await db.select({ id: departments.id }).from(departments).where(eq(departments.id, id)).limit(1)).length > 0;
    }
    case "positions": {
      const id = assertPositiveInt(rawId);
      return (await db.select({ id: positions.id }).from(positions).where(eq(positions.id, id)).limit(1)).length > 0;
    }
    case "employment_statuses": {
      const id = assertPositiveInt(rawId);
      return (await db.select({ id: employmentStatuses.id }).from(employmentStatuses).where(eq(employmentStatuses.id, id)).limit(1)).length > 0;
    }
    case "employment_types": {
      const id = assertPositiveInt(rawId);
      return (await db.select({ id: employmentTypes.id }).from(employmentTypes).where(eq(employmentTypes.id, id)).limit(1)).length > 0;
    }
    case "leave_types": {
      const code = assertNonEmptyText(rawId, "รหัสประเภทการลา");
      return (await db.select({ code: leaveTypes.code }).from(leaveTypes).where(eq(leaveTypes.code, code)).limit(1)).length > 0;
    }
    case "asset_agreement_templates": {
      const id = assertUuid(rawId);
      return (await db.select({ id: assetAgreementTemplates.id }).from(assetAgreementTemplates).where(eq(assetAgreementTemplates.id, id)).limit(1)).length > 0;
    }
    case "asset_agreements": {
      const id = assertUuid(rawId);
      return (await db.select({ id: assetAgreements.id }).from(assetAgreements).where(eq(assetAgreements.id, id)).limit(1)).length > 0;
    }
    case "line_calendar_events": {
      const id = assertUuid(rawId);
      return (await db.select({ id: lineCalendarEvents.id }).from(lineCalendarEvents).where(eq(lineCalendarEvents.id, id)).limit(1)).length > 0;
    }
    case "line_integration_jobs": {
      const id = assertUuid(rawId);
      return (await db.select({ id: lineIntegrationJobs.id }).from(lineIntegrationJobs).where(eq(lineIntegrationJobs.id, id)).limit(1)).length > 0;
    }
    case "line_bot_states": {
      const uid = assertNonEmptyText(rawId, "LINE UID");
      return (await db.select({ lineUid: lineBotStates.lineUid }).from(lineBotStates).where(eq(lineBotStates.lineUid, uid)).limit(1)).length > 0;
    }
    case "line_webhook_events": {
      const eventId = assertNonEmptyText(rawId, "Event ID");
      return (await db.select({ eventId: lineWebhookEvents.eventId }).from(lineWebhookEvents).where(eq(lineWebhookEvents.eventId, eventId)).limit(1)).length > 0;
    }
    default:
      return false;
  }
}

export async function hardDeleteAdminRow(
  tableKey: AdminTableKey,
  rawId: string,
  actor: SessionPayload,
): Promise<{ deleted: true; id: string; deletedRelated: Record<string, number> }> {
  try {
    switch (tableKey) {
      case "employees": {
        const id = assertUuid(rawId);
        if (!isSystemAdminSession(actor) && actor.employeeId === id) {
          throw new AdminDataError(409, "ไม่สามารถลบข้อมูลพนักงานของบัญชีที่กำลังเข้าสู่ระบบอยู่ได้");
        }

        const deletedRelated = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(74821931)`);
          const [existing] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, id)).limit(1);
          if (!existing) throw new AdminDataError(404, "ไม่พบข้อมูลพนักงาน");

          if (!isSystemAdminSession(actor)) {
            const activeAccounts = await tx
              .select({ id: users.id, employeeId: users.employeeId, permissions: users.permissions })
              .from(users)
              .where(eq(users.isActive, true));
            const targetAccount = activeAccounts.find((acc) => acc.employeeId === id);
            if (
              targetAccount
              && hasPermission(targetAccount.permissions, "users.permissions.manage")
              && !activeAccounts.some((acc) => acc.employeeId !== id && hasPermission(acc.permissions, "users.permissions.manage"))
            ) {
              throw new AdminDataError(409, "ไม่สามารถลบพนักงานที่เป็นผู้ดูแลสิทธิ์คนสุดท้ายในฐานข้อมูลได้");
            }
          }

          await tx.update(employees).set({ managerId: null }).where(eq(employees.managerId, id));
          await tx.update(overtimeRequests).set({ decidedByEmployeeId: null }).where(eq(overtimeRequests.decidedByEmployeeId, id));
          await tx.update(overtimeRequests).set({ cancelledByEmployeeId: null }).where(eq(overtimeRequests.cancelledByEmployeeId, id));
          await tx.update(leaveRequests).set({ decidedByEmployeeId: null }).where(eq(leaveRequests.decidedByEmployeeId, id));
          await tx.update(leaveRequests).set({ cancelledByEmployeeId: null }).where(eq(leaveRequests.cancelledByEmployeeId, id));

          const empLeaveIds = (await tx
            .select({ id: leaveRequests.id })
            .from(leaveRequests)
            .where(eq(leaveRequests.employeeId, id))).map((r) => r.id);

          const deletedCalendar = await tx
            .delete(lineCalendarEvents)
            .where(
              empLeaveIds.length > 0
                ? or(eq(lineCalendarEvents.employeeId, id), inArray(lineCalendarEvents.leaveRequestId, empLeaveIds))
                : eq(lineCalendarEvents.employeeId, id),
            )
            .returning({ id: lineCalendarEvents.id });

          const deletedLeaves = await tx
            .delete(leaveRequests)
            .where(eq(leaveRequests.employeeId, id))
            .returning({ id: leaveRequests.id });

          const deletedOt = await tx
            .delete(overtimeRequests)
            .where(eq(overtimeRequests.employeeId, id))
            .returning({ id: overtimeRequests.id });

          const assetReqIds = (await tx
            .select({ id: assetRequests.id })
            .from(assetRequests)
            .where(eq(assetRequests.borrowerEmployeeId, id))).map((r) => r.id);

          let deletedAssetsCount = 0;
          if (assetReqIds.length > 0) {
            await tx.delete(assetRequestEvents).where(inArray(assetRequestEvents.requestId, assetReqIds));
            const deletedAssets = await tx
              .delete(assetRequests)
              .where(inArray(assetRequests.id, assetReqIds))
              .returning({ id: assetRequests.id });
            deletedAssetsCount = deletedAssets.length;
          }

          const deletedUsers = await tx
            .delete(users)
            .where(eq(users.employeeId, id))
            .returning({ id: users.id });

          const deletedEmployees = await tx
            .delete(employees)
            .where(eq(employees.id, id))
            .returning({ id: employees.id });

          if (deletedEmployees.length === 0) {
            throw new AdminDataError(404, "ไม่พบข้อมูลพนักงาน");
          }

          return {
            users: deletedUsers.length,
            overtimeRequests: deletedOt.length,
            leaveRequests: deletedLeaves.length,
            assetRequests: deletedAssetsCount,
            lineCalendarEvents: deletedCalendar.length,
          };
        });

        return { deleted: true, id, deletedRelated };
      }

      case "users": {
        const id = assertUuid(rawId);
        if (!isSystemAdminSession(actor) && actor.sub === id) {
          throw new AdminDataError(409, "ไม่สามารถลบบัญชีผู้ใช้ที่กำลังเข้าสู่ระบบอยู่ได้");
        }
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(74821931)`);
          const activeAccounts = await tx
            .select({ id: users.id, permissions: users.permissions })
            .from(users)
            .where(eq(users.isActive, true));
          const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
          if (!target) throw new AdminDataError(404, "ไม่พบบัญชีผู้ใช้");

          if (!isSystemAdminSession(actor)) {
            const targetIsActiveManager = activeAccounts.some(
              (acc) => acc.id === id && hasPermission(acc.permissions, "users.permissions.manage"),
            );
            const hasOtherManager = activeAccounts.some(
              (acc) => acc.id !== id && hasPermission(acc.permissions, "users.permissions.manage"),
            );
            if (targetIsActiveManager && !hasOtherManager) {
              throw new AdminDataError(409, "ไม่สามารถลบบัญชีผู้ดูแลสิทธิ์คนสุดท้ายในฐานข้อมูลได้");
            }
          }

          await tx.delete(users).where(eq(users.id, id));
        });
        return { deleted: true, id, deletedRelated: {} };
      }

      case "leave_requests": {
        const id = assertUuid(rawId);
        const deletedRelated = await db.transaction(async (tx) => {
          const deletedCalendar = await tx.delete(lineCalendarEvents).where(eq(lineCalendarEvents.leaveRequestId, id)).returning({ id: lineCalendarEvents.id });
          const deleted = await tx.delete(leaveRequests).where(eq(leaveRequests.id, id)).returning({ id: leaveRequests.id });
          if (deleted.length === 0) throw new AdminDataError(404, "ไม่พบคำขอวันลา");
          return { lineCalendarEvents: deletedCalendar.length };
        });
        return { deleted: true, id, deletedRelated };
      }

      case "asset_requests": {
        const id = assertUuid(rawId);
        const deletedRelated = await db.transaction(async (tx) => {
          const [existing] = await tx.select({ id: assetRequests.id }).from(assetRequests).where(eq(assetRequests.id, id)).limit(1);
          if (!existing) throw new AdminDataError(404, "ไม่พบคำขอยืมทรัพย์สิน");
          const deletedEvents = await tx.delete(assetRequestEvents).where(eq(assetRequestEvents.requestId, id)).returning({ id: assetRequestEvents.id });
          await tx.delete(assetRequests).where(eq(assetRequests.id, id));
          return { assetRequestEvents: deletedEvents.length };
        });
        return { deleted: true, id, deletedRelated };
      }

      case "overtime_requests": {
        const id = assertUuid(rawId);
        const [deleted] = await db.delete(overtimeRequests).where(eq(overtimeRequests.id, id)).returning({ id: overtimeRequests.id });
        if (!deleted) throw new AdminDataError(404, "ไม่พบคำขอ OT");
        return { deleted: true, id, deletedRelated: {} };
      }

      case "work_tracking_records": {
        const id = assertUuid(rawId);
        const [deleted] = await db.delete(workTrackingRecords).where(eq(workTrackingRecords.id, id)).returning({ id: workTrackingRecords.id });
        if (!deleted) throw new AdminDataError(404, "ไม่พบบันทึกติดตามงาน");
        return { deleted: true, id, deletedRelated: {} };
      }

      case "work_tracking_requests": {
        const requestId = assertNonEmptyText(rawId, "Request ID");
        const [deleted] = await db.delete(workTrackingRequests).where(eq(workTrackingRequests.requestId, requestId)).returning({ requestId: workTrackingRequests.requestId });
        if (!deleted) throw new AdminDataError(404, "ไม่พบคำขอติดตามงาน LINE");
        return { deleted: true, id: requestId, deletedRelated: {} };
      }

      case "work_tracking_activities": {
        const activityId = assertNonEmptyText(rawId, "Activity ID");
        const [deleted] = await db.delete(workTrackingActivities).where(eq(workTrackingActivities.activityId, activityId)).returning({ activityId: workTrackingActivities.activityId });
        if (!deleted) throw new AdminDataError(404, "ไม่พบกิจกรรมติดตามงาน");
        return { deleted: true, id: activityId, deletedRelated: {} };
      }

      case "employee_documents": {
        const id = assertUuid(rawId);
        const [deleted] = await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id)).returning({ id: employeeDocuments.id });
        if (!deleted) throw new AdminDataError(404, "ไม่พบเอกสารพนักงาน");
        return { deleted: true, id, deletedRelated: {} };
      }

      case "departments": {
        const id = assertPositiveInt(rawId);
        const [deleted] = await db.delete(departments).where(eq(departments.id, id)).returning({ id: departments.id });
        if (!deleted) throw new AdminDataError(404, "ไม่พบแผนก");
        return { deleted: true, id: String(id), deletedRelated: {} };
      }

      case "positions": {
        const id = assertPositiveInt(rawId);
        const [deleted] = await db.delete(positions).where(eq(positions.id, id)).returning({ id: positions.id });
        if (!deleted) throw new AdminDataError(404, "ไม่พบตำแหน่ง");
        return { deleted: true, id: String(id), deletedRelated: {} };
      }

      case "employment_statuses": {
        const id = assertPositiveInt(rawId);
        const [deleted] = await db.delete(employmentStatuses).where(eq(employmentStatuses.id, id)).returning({ id: employmentStatuses.id });
        if (!deleted) throw new AdminDataError(404, "ไม่พบสถานะพนักงาน");
        return { deleted: true, id: String(id), deletedRelated: {} };
      }

      case "employment_types": {
        const id = assertPositiveInt(rawId);
        const [deleted] = await db.delete(employmentTypes).where(eq(employmentTypes.id, id)).returning({ id: employmentTypes.id });
        if (!deleted) throw new AdminDataError(404, "ไม่พบประเภทการจ้างงาน");
        return { deleted: true, id: String(id), deletedRelated: {} };
      }

      case "leave_types": {
        const code = assertNonEmptyText(rawId, "รหัสประเภทการลา");
        const [deleted] = await db.delete(leaveTypes).where(eq(leaveTypes.code, code)).returning({ code: leaveTypes.code });
        if (!deleted) throw new AdminDataError(404, "ไม่พบประเภทการลา");
        return { deleted: true, id: code, deletedRelated: {} };
      }

      case "asset_agreement_templates": {
        const id = assertUuid(rawId);
        const [deleted] = await db.delete(assetAgreementTemplates).where(eq(assetAgreementTemplates.id, id)).returning({ id: assetAgreementTemplates.id });
        if (!deleted) throw new AdminDataError(404, "ไม่พบแม่แบบสัญญา");
        return { deleted: true, id, deletedRelated: {} };
      }

      case "asset_agreements": {
        const id = assertUuid(rawId);
        const [deleted] = await db.delete(assetAgreements).where(eq(assetAgreements.id, id)).returning({ id: assetAgreements.id });
        if (!deleted) throw new AdminDataError(404, "ไม่พบเอกสารสัญญา");
        return { deleted: true, id, deletedRelated: {} };
      }

      case "line_calendar_events": {
        const id = assertUuid(rawId);
        const [deleted] = await db.delete(lineCalendarEvents).where(eq(lineCalendarEvents.id, id)).returning({ id: lineCalendarEvents.id });
        if (!deleted) throw new AdminDataError(404, "ไม่พบกิจกรรมปฏิทิน LINE");
        return { deleted: true, id, deletedRelated: {} };
      }

      case "line_integration_jobs": {
        const id = assertUuid(rawId);
        const [deleted] = await db.delete(lineIntegrationJobs).where(eq(lineIntegrationJobs.id, id)).returning({ id: lineIntegrationJobs.id });
        if (!deleted) throw new AdminDataError(404, "ไม่พบคิวงาน LINE Integration");
        return { deleted: true, id, deletedRelated: {} };
      }

      case "line_bot_states": {
        const lineUid = assertNonEmptyText(rawId, "LINE UID");
        const [deleted] = await db.delete(lineBotStates).where(eq(lineBotStates.lineUid, lineUid)).returning({ lineUid: lineBotStates.lineUid });
        if (!deleted) throw new AdminDataError(404, "ไม่พบสถานะ LINE Bot");
        return { deleted: true, id: lineUid, deletedRelated: {} };
      }

      case "line_webhook_events": {
        const eventId = assertNonEmptyText(rawId, "Event ID");
        const [deleted] = await db.delete(lineWebhookEvents).where(eq(lineWebhookEvents.eventId, eventId)).returning({ eventId: lineWebhookEvents.eventId });
        if (!deleted) throw new AdminDataError(404, "ไม่พบประวัติ Webhook LINE");
        return { deleted: true, id: eventId, deletedRelated: {} };
      }
    }
  } catch (error) {
    handleDbError(error);
  }
}
