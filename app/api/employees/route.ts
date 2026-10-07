import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canManageEmployeeCompensation, canViewEmployeeCompensation } from "@/lib/auth/rolePermissionAccess";
import { canCreateEmployees, canOffboardEmployees, canViewEmployeeProfiles } from "@/lib/auth/permissions";
import {
  EMPLOYEE_COMPENSATION_FIELDS,
  createEmployee,
  employeeLifecycleResponse,
  fetchActiveEmployeeItems,
  fetchAllEmployeeItems,
  jsonError,
} from "@/app/api/employees/_shared";

// GET: accounts with employee profile access may list the directory. Excludes
// soft-deleted (off-boarded) rows by default; accounts with the offboarding
// permission may pass includeDeleted=true to also see off-boarded employees.
export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canViewEmployeeProfiles(user.permissions)) return jsonError(403, "Employee profile view permission required");
  const includeDeleted = request.nextUrl.searchParams.get("includeDeleted") === "true";

  if (includeDeleted && !canOffboardEmployees(user.permissions)) {
    return jsonError(403, "Forbidden");
  }

  const includeCompensation = canViewEmployeeCompensation(user);
  const items = includeDeleted
    ? await fetchAllEmployeeItems(includeCompensation)
    : await fetchActiveEmployeeItems(includeCompensation);
  return NextResponse.json({ items });
});

// POST is the HTTP adapter for the shared employee lifecycle operation.
export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canCreateEmployees(user.permissions)) return jsonError(403, "Forbidden");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonError(400, "Invalid request body");
  const includesCompensation = EMPLOYEE_COMPENSATION_FIELDS.some((field) => field in body);
  if (includesCompensation && !canManageEmployeeCompensation(user)) {
    return jsonError(403, "Compensation management permission required");
  }

  return employeeLifecycleResponse(await createEmployee(body), 201, canViewEmployeeCompensation(user));
});
