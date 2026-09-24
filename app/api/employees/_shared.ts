import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { departments, employees, employmentStatuses, employmentTypes, positions } from "@/lib/db/schema";

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

// Nested department/position/employmentStatus/employmentType (each an
// {id, name} — employmentType also carries `code`) rather than flat
// `departmentId`+`departmentName` pairs: the UI's lookup <Select>s bind
// directly to `{id, name}` shapes returned by the /api/departments etc.
// endpoints, so nesting lets the employee-detail views reuse that same
// shape without remapping.
export function toEmployeeItemDto(row: EmployeeRow) {
  return {
    id: row.id,
    code: row.code,
    prefix: row.prefix,
    firstName: row.firstName,
    lastName: row.lastName,
    nickname: row.nickname,
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

export async function fetchEmployeeItemById(id: string): Promise<EmployeeItemDto | null> {
  const [row] = await employeeBaseSelect().where(eq(employees.id, id));
  return row ? toEmployeeItemDto(row) : null;
}

export async function fetchActiveEmployeeItems(): Promise<EmployeeItemDto[]> {
  const rows = await employeeBaseSelect().where(isNull(employees.deletedAt)).orderBy(asc(employees.firstName), asc(employees.lastName));
  return rows.map(toEmployeeItemDto);
}

export async function fetchAllEmployeeItems(): Promise<EmployeeItemDto[]> {
  const rows = await employeeBaseSelect().orderBy(asc(employees.firstName), asc(employees.lastName));
  return rows.map(toEmployeeItemDto);
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

// Optional lookup ids are null/blank when a master item has been removed.
// `undefined` signals malformed input so handlers can return a useful 400.
export function parseOptionalLookupId(value: unknown): number | null | undefined {
  if (value == null || value === "") return null;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Postgres unique_violation (23505) / foreign_key_violation (23503), as
// thrown by the `postgres` driver — used to turn a raw DB constraint error
// into a clean 4xx response instead of a 500. drizzle-orm wraps every driver
// error in a DrizzleQueryError whose real PostgresError (with `.code` /
// `.constraint_name`) lives one level down as `.cause`, so both the error
// itself and its `.cause` are checked.
function pgError(error: unknown): { code?: unknown; constraint_name?: unknown; constraint?: unknown } | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === "string") return record as { code?: unknown };
  if (typeof record.cause === "object" && record.cause !== null) return record.cause as { code?: unknown };
  return undefined;
}

export function pgErrorCode(error: unknown): string | undefined {
  const value = pgError(error)?.code;
  return typeof value === "string" ? value : undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23505";
}

export function isForeignKeyViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23503";
}

export function constraintName(error: unknown): string | undefined {
  const inner = pgError(error);
  const value = inner?.constraint_name ?? inner?.constraint;
  return typeof value === "string" ? value : undefined;
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}
