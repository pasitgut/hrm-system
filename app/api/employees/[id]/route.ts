import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { departments, employees, employmentStatuses, employmentTypes, positions, users } from "@/lib/db/schema";
import { requireApiRole, requireApiUser, withApiAuth } from "@/lib/auth/dal";
import {
  constraintName,
  findEmployeeCodeConflict,
  fetchEmployeeItemById,
  isForeignKeyViolation,
  isUniqueViolation,
  isValidDateStr,
  isValidEmail,
  isValidUuid,
  jsonError,
  parseOptionalLookupId,
} from "@/app/api/employees/_shared";

type RouteContext = { params: Promise<{ id: string }> };

function readUniqueViolationMessage(error: unknown): string {
  const name = constraintName(error) ?? "";
  if (name.includes("email")) return "Email is already in use";
  if (name.includes("citizen_id")) return "Citizen ID is already in use";
  if (name.includes("code")) return "Employee code is already in use";
  if (name.includes("line_uid")) return "LINE UID is already in use";
  return "A unique field conflicts with an existing employee";
}

// GET: soft-deleted (off-boarded) rows are still fetchable by id, so the
// profile drawer / history views keep working after off-boarding. Only the
// default list (GET /api/employees) excludes them.
export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiUser(request);
  const { id } = await context.params;
  if (!isValidUuid(id)) return jsonError(404, "Not found");

  const item = await fetchEmployeeItemById(id);
  if (!item) return jsonError(404, "Not found");
  return NextResponse.json({ item });
});

const WRITABLE_STRING_FIELDS = ["prefix", "nickname", "citizenId", "firstNameEn", "lastNameEn", "email", "phone", "avatarUrl"] as const;

export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiRole(request, "supervisor", "ceo");
  const { id } = await context.params;
  if (!isValidUuid(id)) return jsonError(404, "Not found");

  const [existing] = await db.select({
    id: employees.id,
    startDate: employees.startDate,
    endDate: employees.endDate,
    deletedAt: employees.deletedAt,
  }).from(employees).where(eq(employees.id, id));
  if (!existing) return jsonError(404, "Not found");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }
  const input = body as Record<string, unknown>;

  const values: Record<string, unknown> = {};

  if ("firstName" in input) {
    if (typeof input.firstName !== "string" || !input.firstName.trim()) return jsonError(400, "firstName cannot be empty");
    values.firstName = input.firstName.trim();
  }
  if ("lastName" in input) {
    if (typeof input.lastName !== "string" || !input.lastName.trim()) return jsonError(400, "lastName cannot be empty");
    values.lastName = input.lastName.trim();
  }
  if ("startDate" in input) {
    if (!isValidDateStr(input.startDate)) return jsonError(400, "startDate must be a YYYY-MM-DD date");
    const endDate = "endDate" in input ? input.endDate : existing.endDate;
    if (typeof endDate === "string" && endDate && endDate < input.startDate) return jsonError(400, "endDate cannot be before startDate");
    values.startDate = input.startDate;
  }
  if ("endDate" in input) {
    if (input.endDate != null && input.endDate !== "" && !isValidDateStr(input.endDate)) return jsonError(400, "endDate must be a YYYY-MM-DD date");
    const endDate = input.endDate == null || input.endDate === "" ? null : input.endDate;
    const startDate = typeof input.startDate === "string" ? input.startDate : existing.startDate;
    if (endDate && endDate < startDate) return jsonError(400, "endDate cannot be before startDate");
    values.endDate = endDate;
  }
  const resultingEndDate = "endDate" in input
    ? (input.endDate == null || input.endDate === "" ? null : input.endDate)
    : existing.endDate;
  if (existing.deletedAt !== null && !resultingEndDate) {
    return jsonError(400, "Former employees must have an end date");
  }
  if ("birthDate" in input) {
    if (input.birthDate != null && input.birthDate !== "" && !isValidDateStr(input.birthDate)) return jsonError(400, "birthDate must be a YYYY-MM-DD date");
    values.birthDate = input.birthDate || null;
  }
  if ("email" in input) {
    if (input.email != null && input.email !== "" && !isValidEmail(input.email)) return jsonError(400, "Invalid email");
    const normalizedEmail = input.email == null || input.email === "" ? null : (input.email as string).trim().toLowerCase();
    if (normalizedEmail === null) {
      const [loginAccount] = await db.select({ id: users.id }).from(users).where(eq(users.employeeId, id)).limit(1);
      if (loginAccount) return jsonError(400, "Email is required for an employee with a login account");
    }
    values.email = normalizedEmail;
  }
  if ("code" in input) {
    if (typeof input.code !== "string" || !/^\d{4}$/.test(input.code.trim())) {
      return jsonError(400, "code must be exactly 4 digits");
    }
    const code = input.code.trim();
    const codeConflict = await findEmployeeCodeConflict(code, id);
    if (codeConflict) return jsonError(409, codeConflict);
    values.code = code;
  }
  for (const field of WRITABLE_STRING_FIELDS) {
    if (field === "email") continue;
    if (field in input) {
      const raw = input[field];
      values[field] = raw == null || raw === "" ? null : raw;
    }
  }

  if ("departmentId" in input) {
    const lookupId = parseOptionalLookupId(input.departmentId);
    if (lookupId === undefined) return jsonError(400, "Invalid departmentId");
    if (lookupId !== null) {
      const [dept] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, lookupId));
      if (!dept) return jsonError(400, "departmentId does not exist");
    }
    values.departmentId = lookupId;
  }
  if ("positionId" in input) {
    const lookupId = parseOptionalLookupId(input.positionId);
    if (lookupId === undefined) return jsonError(400, "Invalid positionId");
    if (lookupId !== null) {
      const [pos] = await db.select({ id: positions.id }).from(positions).where(eq(positions.id, lookupId));
      if (!pos) return jsonError(400, "positionId does not exist");
    }
    values.positionId = lookupId;
  }
  if ("employmentStatusId" in input) {
    const lookupId = parseOptionalLookupId(input.employmentStatusId);
    if (lookupId === undefined) return jsonError(400, "Invalid employmentStatusId");
    if (lookupId !== null) {
      const [status] = await db.select({ id: employmentStatuses.id }).from(employmentStatuses).where(eq(employmentStatuses.id, lookupId));
      if (!status) return jsonError(400, "employmentStatusId does not exist");
    }
    values.employmentStatusId = lookupId;
  }
  if ("employmentTypeId" in input) {
    const lookupId = parseOptionalLookupId(input.employmentTypeId);
    if (lookupId === undefined) return jsonError(400, "Invalid employmentTypeId");
    if (lookupId !== null) {
      const [type] = await db.select({ id: employmentTypes.id }).from(employmentTypes).where(eq(employmentTypes.id, lookupId));
      if (!type) return jsonError(400, "employmentTypeId does not exist");
    }
    values.employmentTypeId = lookupId;
  }
  if ("managerId" in input) {
    const managerId = input.managerId;
    if (managerId == null || managerId === "") {
      values.managerId = null;
    } else {
      if (!isValidUuid(managerId)) return jsonError(400, "Invalid managerId");
      if (managerId === id) return jsonError(400, "An employee cannot be their own manager");
      const [manager] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, managerId as string));
      if (!manager) return jsonError(400, "managerId does not exist");
      values.managerId = managerId;
    }
  }

  if (Object.keys(values).length === 0) {
    const item = await fetchEmployeeItemById(id);
    return NextResponse.json({ item });
  }

  values.updatedAt = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx.update(employees).set(values).where(eq(employees.id, id));
      if (typeof values.email === "string") {
        await tx.update(users).set({ email: values.email, updatedAt: values.updatedAt as Date }).where(eq(users.employeeId, id));
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      if (typeof values.code === "string") {
        const conflict = await findEmployeeCodeConflict(values.code, id);
        if (conflict) return jsonError(409, conflict);
      }
      return jsonError(409, readUniqueViolationMessage(error));
    }
    if (isForeignKeyViolation(error)) return jsonError(400, "One of the referenced ids does not exist");
    throw error;
  }

  const item = await fetchEmployeeItemById(id);
  return NextResponse.json({ item });
});

// DELETE is the offboarding action: retain the employee for leave/OT history,
// record an end date, and disable the linked login in the same transaction.
export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiRole(request, "supervisor", "ceo");
  const { id } = await context.params;
  if (!isValidUuid(id)) return jsonError(404, "Not found");

  const [existing] = await db.select({ id: employees.id, deletedAt: employees.deletedAt, startDate: employees.startDate }).from(employees).where(eq(employees.id, id));
  if (!existing) return jsonError(404, "Not found");
  if (existing.deletedAt !== null) return jsonError(409, "Employee is already off-boarded");

  let endDate = new Date().toISOString().slice(0, 10);
  const body = await request.json().catch(() => null);
  if (typeof body === "object" && body !== null && "endDate" in body) {
    const requestedEndDate = (body as Record<string, unknown>).endDate;
    if (!isValidDateStr(requestedEndDate)) return jsonError(400, "endDate must be a YYYY-MM-DD date");
    endDate = requestedEndDate;
  }
  if (endDate < existing.startDate) return jsonError(400, "endDate cannot be before startDate");

  const deletedAt = new Date();
  const [formerStatus] = await db
    .select({ id: employmentStatuses.id })
    .from(employmentStatuses)
    .where(eq(employmentStatuses.name, "พ้นสภาพ"));
  await db.transaction(async (tx) => {
    await tx.update(employees).set({ deletedAt, endDate, updatedAt: deletedAt, employmentStatusId: formerStatus?.id ?? null }).where(eq(employees.id, id));
    await tx.update(users).set({ isActive: false, updatedAt: deletedAt }).where(eq(users.employeeId, id));
  });

  const item = await fetchEmployeeItemById(id);
  return NextResponse.json({ item });
});
