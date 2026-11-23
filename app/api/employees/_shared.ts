import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { getStoredPermissionsForRole } from "@/lib/auth/role-permissions";
import { departments, employees, employmentStatuses, employmentTypes, positions, users } from "@/lib/db/schema";
import { DEFAULT_OT_RATE_SETTINGS, getOtRateSettings } from "@/lib/settings/otRateSettings";
import { createDefaultEmployeePayrollData, normalizeEmployeePayrollData, type EmployeePayrollData } from "@/lib/employees/payroll-data";
import { employeePayrollDataSchema } from "@/lib/employees/payroll-data-schema";
import { jsonError } from "@/lib/api/response";
import { isForeignKeyViolation, isUniqueViolation, postgresConstraintName } from "@/lib/db/errors";
import { isCloudinaryConfigured, migrateDataImageUrlToCloudinary, migrateImgbbUrlToCloudinary } from "@/lib/cloudinary";
import { healEmployeeAvatarImgbbUrl } from "@/lib/cloudinary-migration";

// Shared helpers for the app/api/employees/** Route Handlers: the joined
// select used by every read, the GET response DTO, employee-code conflicts,
// and small validation utilities. Not a route itself (no HTTP method
// exports), so Next.js ignores this file for routing purposes.

export const managerEmployees = alias(employees, "manager_employees");

export const employeeSelectColumns = {
  id: employees.id,
  code: employees.code,
  prefix: employees.prefix,
  firstName: employees.firstName,
  lastName: employees.lastName,
  baseSalary: employees.baseSalary,
  payrollData: employees.payrollData,
  otWeekdayMultiplier: employees.otWeekdayMultiplier,
  otHolidayMultiplier: employees.otHolidayMultiplier,
  workHoursPerDay: employees.workHoursPerDay,
  weeklyHolidays: employees.weeklyHolidays,
  nickname: employees.nickname,
  citizenId: employees.citizenId,
  firstNameEn: employees.firstNameEn,
  lastNameEn: employees.lastNameEn,
  birthDate: employees.birthDate,
  email: employees.email,
  phone: employees.phone,
  avatarUrl: employees.avatarUrl,
  startDate: employees.startDate,
  endDate: employees.endDate,
  departmentId: departments.id,
  departmentName: departments.name,
  positionId: positions.id,
  positionName: positions.name,
  employmentStatusId: employmentStatuses.id,
  employmentStatusName: employmentStatuses.name,
  employmentTypeId: employmentTypes.id,
  employmentTypeCode: employmentTypes.code,
  employmentTypeName: employmentTypes.name,
  managerId: employees.managerId,
  managerFirstName: managerEmployees.firstName,
  managerLastName: managerEmployees.lastName,
  deletedAt: employees.deletedAt,
  createdAt: employees.createdAt,
} as const;

type EmployeeRow = {
  id: string;
  code: string;
  prefix: string | null;
  firstName: string;
  lastName: string;
  baseSalary: number | null;
  payrollData: EmployeePayrollData;
  otWeekdayMultiplier: number;
  otHolidayMultiplier: number;
  workHoursPerDay: number;
  weeklyHolidays: number[];
  nickname: string | null;
  citizenId: string | null;
  firstNameEn: string | null;
  lastNameEn: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  startDate: string;
  endDate: string | null;
  departmentId: number | null;
  departmentName: string | null;
  positionId: number | null;
  positionName: string | null;
  employmentStatusId: number | null;
  employmentStatusName: string | null;
  employmentTypeId: number | null;
  employmentTypeCode: string | null;
  employmentTypeName: string | null;
  managerId: string | null;
  managerFirstName: string | null;
  managerLastName: string | null;
  deletedAt: Date | null;
  createdAt: Date;
};

export type EmployeeItemDto = ReturnType<typeof toEmployeeItemDto>;

export const EMPLOYEE_COMPENSATION_FIELDS = [
  "baseSalary",
  "payrollData",
  "otWeekdayMultiplier",
  "otHolidayMultiplier",
  "workHoursPerDay",
] as const;

export type EmployeeLifecycleFailure = {
  ok: false;
  kind: "invalid" | "not-found" | "conflict";
  message: string;
};

export type EmployeeLifecycleOutcome<T> = { ok: true; value: T } | EmployeeLifecycleFailure;

function lifecycleFailure(kind: EmployeeLifecycleFailure["kind"], message: string): EmployeeLifecycleFailure {
  return { ok: false, kind, message };
}

export function employeeLifecycleResponse<T>(outcome: EmployeeLifecycleOutcome<T>, status = 200, includeCompensation = true) {
  if (outcome.ok === true) {
    let item = outcome.value;
    if (!includeCompensation && item && typeof item === "object") {
      const visibleItem = { ...(item as Record<string, unknown>) };
      for (const field of EMPLOYEE_COMPENSATION_FIELDS) delete visibleItem[field];
      item = visibleItem as T;
    }
    return NextResponse.json({ item }, { status });
  }
  const statusByKind = { invalid: 400, "not-found": 404, conflict: 409 } as const;
  return jsonError(statusByKind[outcome.kind], outcome.message);
}

// Nested department/position/employmentStatus/employmentType (each an
// {id, name} — employmentType also carries `code`) rather than flat
// `departmentId`+`departmentName` pairs: the UI's lookup <Select>s bind
// directly to `{id, name}` shapes returned by the /api/departments etc.
// endpoints, so nesting lets the employee-detail views reuse that same
// shape without remapping.
export function toEmployeeItemDto(row: EmployeeRow, includeCompensation = false) {
  return {
    id: row.id,
    code: row.code,
    prefix: row.prefix,
    firstName: row.firstName,
    lastName: row.lastName,
    ...(includeCompensation ? {
      baseSalary: row.baseSalary,
      payrollData: normalizeEmployeePayrollData(row.payrollData),
      otWeekdayMultiplier: row.otWeekdayMultiplier,
      otHolidayMultiplier: row.otHolidayMultiplier,
      workHoursPerDay: row.workHoursPerDay,
    } : {}),
    nickname: row.nickname,
    weeklyHolidays: row.weeklyHolidays,
    citizenId: row.citizenId,
    firstNameEn: row.firstNameEn,
    lastNameEn: row.lastNameEn,
    birthDate: row.birthDate,
    email: row.email,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    startDate: row.startDate,
    endDate: row.endDate,
    department: row.departmentId === null ? null : { id: row.departmentId, name: row.departmentName ?? "" },
    position: row.positionId === null ? null : { id: row.positionId, name: row.positionName ?? "" },
    employmentStatus: row.employmentStatusId === null ? null : { id: row.employmentStatusId, name: row.employmentStatusName ?? "" },
    employmentType: row.employmentTypeId === null ? null : { id: row.employmentTypeId, code: row.employmentTypeCode ?? "", name: row.employmentTypeName ?? "" },
    managerId: row.managerId,
    managerName: row.managerId ? `${row.managerFirstName ?? ""} ${row.managerLastName ?? ""}`.trim() : null,
    isActive: row.deletedAt === null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function employeeBaseSelect() {
  return db
    .select(employeeSelectColumns)
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .leftJoin(employmentStatuses, eq(employees.employmentStatusId, employmentStatuses.id))
    .leftJoin(employmentTypes, eq(employees.employmentTypeId, employmentTypes.id))
    .leftJoin(managerEmployees, eq(employees.managerId, managerEmployees.id));
}

export async function fetchEmployeeItemById(id: string, includeCompensation = false): Promise<EmployeeItemDto | null> {
  const [row] = await employeeBaseSelect().where(eq(employees.id, id));
  if (!row) return null;
  const healed = isCloudinaryConfigured() ? await healEmployeeAvatarImgbbUrl(row) : row;
  return toEmployeeItemDto(healed, includeCompensation);
}

export async function employeeExists(id: string): Promise<boolean> {
  const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, id)).limit(1);
  return employee !== undefined;
}

export async function fetchActiveEmployeeItems(includeCompensation = false): Promise<EmployeeItemDto[]> {
  const rows = await employeeBaseSelect().where(isNull(employees.deletedAt)).orderBy(asc(employees.firstName), asc(employees.lastName));
  const healed = isCloudinaryConfigured() ? await Promise.all(rows.map((row) => healEmployeeAvatarImgbbUrl(row))) : rows;
  return healed.map((row) => toEmployeeItemDto(row, includeCompensation));
}

export async function fetchAllEmployeeItems(includeCompensation = false): Promise<EmployeeItemDto[]> {
  const rows = await employeeBaseSelect().orderBy(asc(employees.firstName), asc(employees.lastName));
  const healed = isCloudinaryConfigured() ? await Promise.all(rows.map((row) => healEmployeeAvatarImgbbUrl(row))) : rows;
  return healed.map((row) => toEmployeeItemDto(row, includeCompensation));
}

// Employee codes are entered by the person creating the employee. Include
// soft-deleted rows because codes remain unique for the lifetime of a record.
export async function findEmployeeCodeConflict(code: string, excludingEmployeeId?: string): Promise<string | null> {
  const where = excludingEmployeeId
    ? and(eq(employees.code, code), ne(employees.id, excludingEmployeeId))
    : eq(employees.code, code);
  const [owner] = await db
    .select({ firstName: employees.firstName, lastName: employees.lastName, prefix: employees.prefix, deletedAt: employees.deletedAt })
    .from(employees)
    .where(where)
    .limit(1);
  if (!owner) return null;
  const fullName = [owner.prefix, owner.firstName, owner.lastName].filter(Boolean).join(" ");
  const formerLabel = owner.deletedAt ? " (พ้นสภาพ)" : "";
  return `รหัสพนักงาน ${code} ซ้ำกับ ${fullName}${formerLabel}`;
}

export function isValidDateStr(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseWeeklyHolidays(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return undefined;
  if (new Set(value).size !== value.length) return undefined;
  return [...value].sort((a, b) => a - b);
}

// Optional lookup ids are null/blank when a master item has been removed.
// `undefined` signals malformed input so handlers can return a useful 400.
export function parseOptionalLookupId(value: unknown): number | null | undefined {
  if (value == null || value === "") return null;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function parseOptionalNumber(value: unknown): number | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMultiplier(value: unknown, defaultValue: number): number | undefined {
  const parsed = value === undefined ? defaultValue : parseOptionalNumber(value);
  return typeof parsed === "number" && parsed > 0 && parsed <= 10 ? parsed : undefined;
}

function parseWorkHours(value: unknown, defaultValue: number): number | undefined {
  const parsed = value === undefined ? defaultValue : parseOptionalNumber(value);
  return typeof parsed === "number" && parsed > 0 && parsed <= 24 ? parsed : undefined;
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export { jsonError };

function uniqueViolationMessage(error: unknown): string {
  const name = postgresConstraintName(error) ?? "";
  if (name.includes("email")) return "Email is already in use";
  if (name.includes("citizen_id")) return "Citizen ID is already in use";
  if (name.includes("code")) return "Employee code is already in use";
  if (name.includes("line_uid")) return "LINE UID is already in use";
  return "A unique field conflicts with an existing employee";
}

async function hasRows<T>(query: PromiseLike<T[]> | null): Promise<boolean> {
  return query ? (await query).length > 0 : true;
}

type EmployeeLookupIds = Partial<{
  departmentId: number | null;
  positionId: number | null;
  employmentStatusId: number | null;
  employmentTypeId: number | null;
  managerId: string | null;
}>;

async function missingEmployeeLookup(ids: EmployeeLookupIds): Promise<keyof EmployeeLookupIds | null> {
  const [departmentExists, positionExists, statusExists, typeExists, managerExists] = await Promise.all([
    hasRows(ids.departmentId == null ? null : db.select({ id: departments.id }).from(departments).where(eq(departments.id, ids.departmentId)).limit(1)),
    hasRows(ids.positionId == null ? null : db.select({ id: positions.id }).from(positions).where(eq(positions.id, ids.positionId)).limit(1)),
    hasRows(ids.employmentStatusId == null ? null : db.select({ id: employmentStatuses.id }).from(employmentStatuses).where(eq(employmentStatuses.id, ids.employmentStatusId)).limit(1)),
    hasRows(ids.employmentTypeId == null ? null : db.select({ id: employmentTypes.id }).from(employmentTypes).where(eq(employmentTypes.id, ids.employmentTypeId)).limit(1)),
    hasRows(ids.managerId == null ? null : db.select({ id: employees.id }).from(employees).where(eq(employees.id, ids.managerId)).limit(1)),
  ]);

  if (ids.departmentId !== undefined && !departmentExists) return "departmentId";
  if (ids.positionId !== undefined && !positionExists) return "positionId";
  if (ids.employmentStatusId !== undefined && !statusExists) return "employmentStatusId";
  if (ids.employmentTypeId !== undefined && !typeExists) return "employmentTypeId";
  if (ids.managerId && !managerExists) return "managerId";
  return null;
}

// Employee creation and its first-login account are one lifecycle operation.
export async function createEmployee(input: unknown): Promise<EmployeeLifecycleOutcome<EmployeeItemDto | null>> {
  if (typeof input !== "object" || input === null) {
    return lifecycleFailure("invalid", "Invalid request body");
  }

  const {
    code: codeInput,
    prefix,
    firstName,
    lastName,
    nickname,
    citizenId,
    firstNameEn,
    lastNameEn,
    birthDate,
    email,
    phone,
    avatarUrl,
    baseSalary,
    payrollData,
    otWeekdayMultiplier,
    otHolidayMultiplier,
    workHoursPerDay,
    weeklyHolidays,
    startDate,
    endDate,
    departmentId,
    positionId,
    employmentStatusId,
    employmentTypeId,
    managerId,
  } = input as Record<string, unknown>;

  const otRateDefaults = otWeekdayMultiplier === undefined || otHolidayMultiplier === undefined
    ? await getOtRateSettings()
    : DEFAULT_OT_RATE_SETTINGS;

  if (typeof firstName !== "string" || !firstName.trim()) return lifecycleFailure("invalid", "firstName is required");
  if (typeof lastName !== "string" || !lastName.trim()) return lifecycleFailure("invalid", "lastName is required");
  if (!isValidDateStr(startDate)) return lifecycleFailure("invalid", "startDate must be a YYYY-MM-DD date");
  if (endDate != null && endDate !== "" && !isValidDateStr(endDate)) return lifecycleFailure("invalid", "endDate must be a YYYY-MM-DD date");
  if (typeof endDate === "string" && endDate && endDate < startDate) return lifecycleFailure("invalid", "endDate cannot be before startDate");
  const departmentIdValue = parseOptionalLookupId(departmentId);
  const positionIdValue = parseOptionalLookupId(positionId);
  const employmentStatusIdValue = parseOptionalLookupId(employmentStatusId);
  const employmentTypeIdValue = parseOptionalLookupId(employmentTypeId);
  if (departmentIdValue === undefined) return lifecycleFailure("invalid", "Invalid departmentId");
  if (positionIdValue === undefined) return lifecycleFailure("invalid", "Invalid positionId");
  if (employmentStatusIdValue === undefined) return lifecycleFailure("invalid", "Invalid employmentStatusId");
  if (employmentTypeIdValue === undefined) return lifecycleFailure("invalid", "Invalid employmentTypeId");
  if (typeof email !== "string" || !email.trim()) return lifecycleFailure("invalid", "email is required");
  if (!isValidEmail(email.trim())) return lifecycleFailure("invalid", "Invalid email");
  if (birthDate != null && birthDate !== "" && !isValidDateStr(birthDate)) return lifecycleFailure("invalid", "birthDate must be a YYYY-MM-DD date");
  if (managerId != null && managerId !== "" && !isValidUuid(managerId)) return lifecycleFailure("invalid", "Invalid managerId");
  const baseSalaryValue = parseOptionalNumber(baseSalary);
  const payrollDataResult = employeePayrollDataSchema.safeParse(payrollData ?? createDefaultEmployeePayrollData());
  const otWeekdayMultiplierValue = parseMultiplier(otWeekdayMultiplier, otRateDefaults.weekdayMultiplier);
  const otHolidayMultiplierValue = parseMultiplier(otHolidayMultiplier, otRateDefaults.holidayMultiplier);
  const workHoursPerDayValue = parseWorkHours(workHoursPerDay, 8);
  const weeklyHolidaysValue = weeklyHolidays === undefined ? [] : parseWeeklyHolidays(weeklyHolidays);
  if (baseSalaryValue === undefined || (typeof baseSalaryValue === "number" && baseSalaryValue < 0)) return lifecycleFailure("invalid", "Invalid baseSalary");
  if (!payrollDataResult.success) return lifecycleFailure("invalid", "ข้อมูลรายได้/หักไม่ถูกต้อง");
  if (otWeekdayMultiplierValue === undefined) return lifecycleFailure("invalid", "Invalid weekday OT multiplier");
  if (otHolidayMultiplierValue === undefined) return lifecycleFailure("invalid", "Invalid holiday OT multiplier");
  if (workHoursPerDayValue === undefined) return lifecycleFailure("invalid", "Invalid work hours per day");
  if (weeklyHolidaysValue === undefined) return lifecycleFailure("invalid", "weeklyHolidays must contain unique weekday numbers from 0 to 6");
  if (typeof codeInput !== "string" || !/^\d{4}$/.test(codeInput.trim())) {
    return lifecycleFailure("invalid", "code must be exactly 4 digits");
  }

  const employeeCode = codeInput.trim();
  const employeeEmail = email.trim().toLowerCase();
  const managerIdValue = managerId != null && managerId !== "" ? managerId as string : null;

  const [codeConflict, missingLookup] = await Promise.all([
    findEmployeeCodeConflict(employeeCode),
    missingEmployeeLookup({
      departmentId: departmentIdValue,
      positionId: positionIdValue,
      employmentStatusId: employmentStatusIdValue,
      employmentTypeId: employmentTypeIdValue,
      managerId: managerIdValue,
    }),
  ]);

  if (codeConflict) return lifecycleFailure("conflict", codeConflict);
  if (missingLookup) return lifecycleFailure("invalid", `${missingLookup} does not exist`);

  const rawAvatarUrl = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
  const normalizedAvatarUrl = rawAvatarUrl
    ? await migrateDataImageUrlToCloudinary(
        await migrateImgbbUrlToCloudinary(rawAvatarUrl, "avatar"),
        "avatar",
      )
    : null;

  const values = {
    code: employeeCode,
    prefix: (prefix as string) || null,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    baseSalary: baseSalaryValue,
    payrollData: payrollDataResult.data,
    otWeekdayMultiplier: otWeekdayMultiplierValue,
    otHolidayMultiplier: otHolidayMultiplierValue,
    workHoursPerDay: workHoursPerDayValue,
    weeklyHolidays: weeklyHolidaysValue,
    nickname: (nickname as string) || null,
    citizenId: (citizenId as string) || null,
    firstNameEn: (firstNameEn as string) || null,
    lastNameEn: (lastNameEn as string) || null,
    birthDate: (birthDate as string) || null,
    email: employeeEmail,
    phone: (phone as string) || null,
    avatarUrl: normalizedAvatarUrl,
    startDate,
    endDate: (endDate as string) || null,
    departmentId: departmentIdValue,
    positionId: positionIdValue,
    employmentStatusId: employmentStatusIdValue,
    employmentTypeId: employmentTypeIdValue,
    managerId: managerIdValue,
  };

  try {
    const passwordHash = await hashPassword(employeeCode);
    const employeeId = await db.transaction(async (tx) => {
      const defaultEmployeePermissions = await getStoredPermissionsForRole("employee", tx);
      const [inserted] = await tx.insert(employees).values(values).returning({ id: employees.id });
      await tx.insert(users).values({
        employeeId: inserted.id,
        email: employeeEmail,
        passwordHash,
        role: "employee",
        permissions: defaultEmployeePermissions,
        mustChangePassword: true,
      });
      return inserted.id;
    });
    return { ok: true, value: await fetchEmployeeItemById(employeeId, true) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const conflict = await findEmployeeCodeConflict(employeeCode);
      return lifecycleFailure("conflict", conflict ?? uniqueViolationMessage(error));
    }
    if (isForeignKeyViolation(error)) {
      return lifecycleFailure("invalid", "One of the referenced ids does not exist");
    }
    throw error;
  }
}

const WRITABLE_STRING_FIELDS = ["prefix", "nickname", "citizenId", "firstNameEn", "lastNameEn", "email", "phone", "avatarUrl"] as const;

// Employee edits and linked account email changes share one validation and
// transaction boundary.
export async function updateEmployee(id: string, input: unknown): Promise<EmployeeLifecycleOutcome<EmployeeItemDto | null>> {
  const [existing] = await db.select({
    id: employees.id,
    code: employees.code,
    startDate: employees.startDate,
    endDate: employees.endDate,
    deletedAt: employees.deletedAt,
  }).from(employees).where(eq(employees.id, id)).limit(1);
  if (!existing) return lifecycleFailure("not-found", "Not found");
  if (typeof input !== "object" || input === null) return lifecycleFailure("invalid", "Invalid request body");
  const body = input as Record<string, unknown>;

  const values: Record<string, unknown> = {};
  if ("baseSalary" in body) {
    const value = parseOptionalNumber(body.baseSalary);
    if (value === undefined || (typeof value === "number" && value < 0)) return lifecycleFailure("invalid", "Invalid baseSalary");
    values.baseSalary = value;
  }
  if ("payrollData" in body) {
    const result = employeePayrollDataSchema.safeParse(body.payrollData);
    if (!result.success) return lifecycleFailure("invalid", "ข้อมูลรายได้/หักไม่ถูกต้อง");
    values.payrollData = result.data;
  }
  if ("otWeekdayMultiplier" in body) {
    const value = parseMultiplier(body.otWeekdayMultiplier, 1.5);
    if (value === undefined) return lifecycleFailure("invalid", "Invalid weekday OT multiplier");
    values.otWeekdayMultiplier = value;
  }
  if ("otHolidayMultiplier" in body) {
    const value = parseMultiplier(body.otHolidayMultiplier, 3);
    if (value === undefined) return lifecycleFailure("invalid", "Invalid holiday OT multiplier");
    values.otHolidayMultiplier = value;
  }
  if ("workHoursPerDay" in body) {
    const value = parseWorkHours(body.workHoursPerDay, 8);
    if (value === undefined) return lifecycleFailure("invalid", "Invalid work hours per day");
    values.workHoursPerDay = value;
  }
  if ("weeklyHolidays" in body) {
    const value = parseWeeklyHolidays(body.weeklyHolidays);
    if (value === undefined) return lifecycleFailure("invalid", "weeklyHolidays must contain unique weekday numbers from 0 to 6");
    values.weeklyHolidays = value;
  }
  if ("firstName" in body) {
    if (typeof body.firstName !== "string" || !body.firstName.trim()) return lifecycleFailure("invalid", "firstName cannot be empty");
    values.firstName = body.firstName.trim();
  }
  if ("lastName" in body) {
    if (typeof body.lastName !== "string" || !body.lastName.trim()) return lifecycleFailure("invalid", "lastName cannot be empty");
    values.lastName = body.lastName.trim();
  }
  if ("startDate" in body) {
    if (!isValidDateStr(body.startDate)) return lifecycleFailure("invalid", "startDate must be a YYYY-MM-DD date");
    const endDate = "endDate" in body ? body.endDate : existing.endDate;
    if (typeof endDate === "string" && endDate && endDate < body.startDate) return lifecycleFailure("invalid", "endDate cannot be before startDate");
    values.startDate = body.startDate;
  }
  if ("endDate" in body) {
    if (body.endDate != null && body.endDate !== "" && !isValidDateStr(body.endDate)) return lifecycleFailure("invalid", "endDate must be a YYYY-MM-DD date");
    const endDate = body.endDate == null || body.endDate === "" ? null : body.endDate;
    const startDate = typeof body.startDate === "string" ? body.startDate : existing.startDate;
    if (endDate && endDate < startDate) return lifecycleFailure("invalid", "endDate cannot be before startDate");
    values.endDate = endDate;
  }
  const resultingEndDate = "endDate" in body
    ? (body.endDate == null || body.endDate === "" ? null : body.endDate)
    : existing.endDate;
  if (existing.deletedAt !== null && !resultingEndDate) {
    return lifecycleFailure("invalid", "Former employees must have an end date");
  }
  if ("birthDate" in body) {
    if (body.birthDate != null && body.birthDate !== "" && !isValidDateStr(body.birthDate)) return lifecycleFailure("invalid", "birthDate must be a YYYY-MM-DD date");
    values.birthDate = body.birthDate || null;
  }

  let requiresLinkedAccount = false;
  if ("email" in body) {
    if (body.email != null && body.email !== "" && !isValidEmail(body.email)) return lifecycleFailure("invalid", "Invalid email");
    const normalizedEmail = body.email == null || body.email === "" ? null : (body.email as string).trim().toLowerCase();
    requiresLinkedAccount = normalizedEmail === null;
    values.email = normalizedEmail;
  }
  if ("code" in body) {
    if (typeof body.code !== "string" || !/^\d{4}$/.test(body.code.trim())) {
      return lifecycleFailure("invalid", "code must be exactly 4 digits");
    }
    values.code = body.code.trim();
  }
  for (const field of WRITABLE_STRING_FIELDS) {
    if (field === "email") continue;
    if (field in body) {
      const raw = body[field];
      values[field] = raw == null || raw === "" ? null : raw;
    }
  }
  if (typeof values.avatarUrl === "string") {
    values.avatarUrl = await migrateDataImageUrlToCloudinary(
      await migrateImgbbUrlToCloudinary(values.avatarUrl, "avatar"),
      "avatar",
    );
  }

  const lookupIds: EmployeeLookupIds = {};
  for (const field of ["departmentId", "positionId", "employmentStatusId", "employmentTypeId"] as const) {
    if (!(field in body)) continue;
    const lookupId = parseOptionalLookupId(body[field]);
    if (lookupId === undefined) return lifecycleFailure("invalid", `Invalid ${field}`);
    lookupIds[field] = lookupId;
    values[field] = lookupId;
  }

  let managerIdValue: string | null | undefined;
  if ("managerId" in body) {
    const managerId = body.managerId;
    if (managerId == null || managerId === "") {
      managerIdValue = null;
    } else {
      if (!isValidUuid(managerId)) return lifecycleFailure("invalid", "Invalid managerId");
      if (managerId === id) return lifecycleFailure("invalid", "An employee cannot be their own manager");
      managerIdValue = managerId;
    }
    values.managerId = managerIdValue;
    lookupIds.managerId = managerIdValue;
  }

  const checkLinkedAccount = requiresLinkedAccount || typeof values.email === "string";
  const [codeConflict, missingLookup, linkedAccountExists] = await Promise.all([
    typeof values.code === "string" ? findEmployeeCodeConflict(values.code, id) : Promise.resolve(null),
    missingEmployeeLookup(lookupIds),
    checkLinkedAccount ? hasRows(db.select({ id: users.id }).from(users).where(eq(users.employeeId, id)).limit(1)) : Promise.resolve(false),
  ]);

  if (requiresLinkedAccount && linkedAccountExists) return lifecycleFailure("invalid", "Email is required for an employee with a login account");
  if (codeConflict) return lifecycleFailure("conflict", codeConflict);
  if (missingLookup) return lifecycleFailure("invalid", `${missingLookup} does not exist`);

  if (Object.keys(values).length === 0) {
    return { ok: true, value: await fetchEmployeeItemById(id, true) };
  }

  const newUserPasswordHash = typeof values.email === "string" && existing.deletedAt === null && !linkedAccountExists
    ? await hashPassword(typeof values.code === "string" ? values.code : existing.code)
    : null;

  const updatedAt = new Date();
  values.updatedAt = updatedAt;
  try {
    await db.transaction(async (tx) => {
      await tx.update(employees).set(values).where(eq(employees.id, id));
      if (typeof values.email === "string") {
        if (linkedAccountExists) {
          await tx.update(users).set({ email: values.email, updatedAt }).where(eq(users.employeeId, id));
        } else if (existing.deletedAt === null && newUserPasswordHash) {
          const defaultEmployeePermissions = await getStoredPermissionsForRole("employee", tx);
          await tx
            .insert(users)
            .values({
              employeeId: id,
              email: values.email,
              passwordHash: newUserPasswordHash,
              role: "employee",
              permissions: defaultEmployeePermissions,
              mustChangePassword: true,
              isActive: true,
            })
            .onConflictDoNothing();
        }
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const conflict = typeof values.code === "string" ? await findEmployeeCodeConflict(values.code, id) : null;
      return lifecycleFailure("conflict", conflict ?? uniqueViolationMessage(error));
    }
    if (isForeignKeyViolation(error)) return lifecycleFailure("invalid", "One of the referenced ids does not exist");
    throw error;
  }

  return { ok: true, value: await fetchEmployeeItemById(id, true) };
}

// Offboarding preserves employee history while disabling the associated login.
export async function offboardEmployee(id: string, input: unknown): Promise<EmployeeLifecycleOutcome<EmployeeItemDto | null>> {
  const [existing] = await db.select({
    id: employees.id,
    deletedAt: employees.deletedAt,
    startDate: employees.startDate,
  }).from(employees).where(eq(employees.id, id)).limit(1);
  if (!existing) return lifecycleFailure("not-found", "Not found");
  if (existing.deletedAt !== null) return lifecycleFailure("conflict", "Employee is already off-boarded");

  let endDate = new Date().toISOString().slice(0, 10);
  if (typeof input === "object" && input !== null && "endDate" in input) {
    const requestedEndDate = (input as Record<string, unknown>).endDate;
    if (!isValidDateStr(requestedEndDate)) return lifecycleFailure("invalid", "endDate must be a YYYY-MM-DD date");
    endDate = requestedEndDate;
  }
  if (endDate < existing.startDate) return lifecycleFailure("invalid", "endDate cannot be before startDate");

  const deletedAt = new Date();
  const [formerStatus] = await db
    .select({ id: employmentStatuses.id })
    .from(employmentStatuses)
    .where(eq(employmentStatuses.name, "พ้นสภาพ"))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx.update(employees)
      .set({ deletedAt, endDate, updatedAt: deletedAt, employmentStatusId: formerStatus?.id ?? null })
      .where(eq(employees.id, id));
    await tx.update(users).set({ isActive: false, updatedAt: deletedAt }).where(eq(users.employeeId, id));
  });

  return { ok: true, value: await fetchEmployeeItemById(id, true) };
}
