import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { departments, employees, employmentStatuses, employmentTypes, positions, users } from "@/lib/db/schema";
import { requireApiRole, requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/password";
import { canManageEmployees } from "@/lib/auth/permissions";
import {
  constraintName,
  fetchActiveEmployeeItems,
  fetchAllEmployeeItems,
  fetchEmployeeItemById,
  findEmployeeCodeConflict,
  isForeignKeyViolation,
  isUniqueViolation,
  isValidDateStr,
  isValidEmail,
  isValidUuid,
  jsonError,
  parseOptionalLookupId,
} from "@/app/api/employees/_shared";

// GET: any authenticated role may list the employee directory. Excludes
// soft-deleted (off-boarded) rows by default; only supervisor/ceo may pass
// includeDeleted=true to also see off-boarded employees (403 for `employee`).
export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const includeDeleted = request.nextUrl.searchParams.get("includeDeleted") === "true";

  if (includeDeleted && !canManageEmployees(user.role)) {
    return jsonError(403, "Forbidden");
  }

  const items = includeDeleted ? await fetchAllEmployeeItems() : await fetchActiveEmployeeItems();
  return NextResponse.json({ items });
});

function readUniqueViolationMessage(error: unknown): string {
  const name = constraintName(error) ?? "";
  if (name.includes("email")) return "Email is already in use";
  if (name.includes("citizen_id")) return "Citizen ID is already in use";
  if (name.includes("code")) return "Employee code is already in use";
  if (name.includes("line_uid")) return "LINE UID is already in use";
  return "A unique field conflicts with an existing employee";
}

// POST creates the employee and their first-login account as one operation.
export const POST = withApiAuth(async (request: NextRequest) => {
  await requireApiRole(request, "supervisor", "ceo");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
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
    startDate,
    endDate,
    departmentId,
    positionId,
    employmentStatusId,
    employmentTypeId,
    managerId,
  } = body as Record<string, unknown>;

  if (typeof firstName !== "string" || !firstName.trim()) return jsonError(400, "firstName is required");
  if (typeof lastName !== "string" || !lastName.trim()) return jsonError(400, "lastName is required");
  if (!isValidDateStr(startDate)) return jsonError(400, "startDate must be a YYYY-MM-DD date");
  if (endDate != null && endDate !== "" && !isValidDateStr(endDate)) return jsonError(400, "endDate must be a YYYY-MM-DD date");
  if (typeof endDate === "string" && endDate && endDate < startDate) return jsonError(400, "endDate cannot be before startDate");
  const departmentIdValue = parseOptionalLookupId(departmentId);
  const positionIdValue = parseOptionalLookupId(positionId);
  const employmentStatusIdValue = parseOptionalLookupId(employmentStatusId);
  const employmentTypeIdValue = parseOptionalLookupId(employmentTypeId);
  if (departmentIdValue === undefined) return jsonError(400, "Invalid departmentId");
  if (positionIdValue === undefined) return jsonError(400, "Invalid positionId");
  if (employmentStatusIdValue === undefined) return jsonError(400, "Invalid employmentStatusId");
  if (employmentTypeIdValue === undefined) return jsonError(400, "Invalid employmentTypeId");
  if (typeof email !== "string" || !email.trim()) return jsonError(400, "email is required");
  if (!isValidEmail(email.trim())) return jsonError(400, "Invalid email");
  if (birthDate != null && birthDate !== "" && !isValidDateStr(birthDate)) return jsonError(400, "birthDate must be a YYYY-MM-DD date");
  if (managerId != null && managerId !== "" && !isValidUuid(managerId)) return jsonError(400, "Invalid managerId");
  if (typeof codeInput !== "string" || !/^\d{4}$/.test(codeInput.trim())) {
    return jsonError(400, "code must be exactly 4 digits");
  }
  const employeeCode = codeInput.trim();
  const employeeEmail = (email as string).trim().toLowerCase();
  const codeConflict = await findEmployeeCodeConflict(employeeCode);
  if (codeConflict) return jsonError(409, codeConflict);

  if (departmentIdValue !== null) {
    const [dept] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, departmentIdValue));
    if (!dept) return jsonError(400, "departmentId does not exist");
  }
  if (positionIdValue !== null) {
    const [pos] = await db.select({ id: positions.id }).from(positions).where(eq(positions.id, positionIdValue));
    if (!pos) return jsonError(400, "positionId does not exist");
  }
  if (employmentStatusIdValue !== null) {
    const [status] = await db.select({ id: employmentStatuses.id }).from(employmentStatuses).where(eq(employmentStatuses.id, employmentStatusIdValue));
    if (!status) return jsonError(400, "employmentStatusId does not exist");
  }
  if (employmentTypeIdValue !== null) {
    const [type] = await db.select({ id: employmentTypes.id }).from(employmentTypes).where(eq(employmentTypes.id, employmentTypeIdValue));
    if (!type) return jsonError(400, "employmentTypeId does not exist");
  }

  const managerIdValue = managerId != null && managerId !== "" ? (managerId as string) : null;
  if (managerIdValue) {
    const [manager] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, managerIdValue));
    if (!manager) return jsonError(400, "managerId does not exist");
  }

  const values = {
    prefix: (prefix as string) || null,
    firstName: (firstName as string).trim(),
    lastName: (lastName as string).trim(),
    nickname: (nickname as string) || null,
    citizenId: (citizenId as string) || null,
    firstNameEn: (firstNameEn as string) || null,
    lastNameEn: (lastNameEn as string) || null,
    birthDate: (birthDate as string) || null,
    email: employeeEmail,
    phone: (phone as string) || null,
    avatarUrl: (avatarUrl as string) || null,
    startDate: startDate as string,
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
      const [inserted] = await tx.insert(employees).values({ ...values, code: employeeCode }).returning({ id: employees.id });
      await tx.insert(users).values({
        employeeId: inserted.id,
        email: employeeEmail,
        passwordHash,
        role: "employee",
        mustChangePassword: true,
      });
      return inserted.id;
    });
    const item = await fetchEmployeeItemById(employeeId);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const conflict = await findEmployeeCodeConflict(employeeCode);
      if (conflict) return jsonError(409, conflict);
      return jsonError(409, readUniqueViolationMessage(error));
    }
    if (isForeignKeyViolation(error)) {
      return jsonError(400, "One of the referenced ids does not exist");
    }
    throw error;
  }
});
