import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canManageEmployeeCompensation, canViewEmployeeCompensation } from "@/lib/auth/rolePermissionAccess";
import { canOffboardEmployees, canUpdateEmployeeProfiles, canViewEmployeeProfiles } from "@/lib/auth/permissions";
import {
  EMPLOYEE_COMPENSATION_FIELDS,
  employeeLifecycleResponse,
  employeeExists,
  fetchEmployeeItemById,
  isValidUuid,
  jsonError,
  offboardEmployee,
  updateEmployee,
} from "@/app/api/employees/_shared";

type RouteContext = { params: Promise<{ id: string }> };

// Soft-deleted employees remain fetchable by id for profile history views.
export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  if (!canViewEmployeeProfiles(user.permissions)) return jsonError(403, "Employee profile view permission required");
  const { id } = await context.params;
  if (!isValidUuid(id)) return jsonError(404, "Not found");

  const item = await fetchEmployeeItemById(id, canViewEmployeeCompensation(user));
  if (!item) return jsonError(404, "Not found");
  return NextResponse.json({ item });
});

// PATCH is the HTTP adapter for the shared employee update operation.
export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  const { id } = await context.params;
  if (!isValidUuid(id)) return jsonError(404, "Not found");
  if (!(await employeeExists(id))) return jsonError(404, "Not found");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonError(400, "Invalid request body");
  const fields = Object.keys(body);
  const includesCompensation = EMPLOYEE_COMPENSATION_FIELDS.some((field) => field in body);
  const includesProfile = fields.some((field) => !EMPLOYEE_COMPENSATION_FIELDS.includes(field as (typeof EMPLOYEE_COMPENSATION_FIELDS)[number]));
  if (includesCompensation && !canManageEmployeeCompensation(user)) {
    return jsonError(403, "Compensation management permission required");
  }
  if (includesProfile && !canUpdateEmployeeProfiles(user.permissions)) {
    return jsonError(403, "Employee profile update permission required");
  }
  if (!includesCompensation && !includesProfile) return jsonError(400, "No employee fields were provided");

  return employeeLifecycleResponse(await updateEmployee(id, body), 200, canViewEmployeeCompensation(user));
});

// DELETE offboards through the shared lifecycle operation.
export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  if (!canOffboardEmployees(user.permissions)) return jsonError(403, "Employee offboarding permission required");
  const { id } = await context.params;
  if (!isValidUuid(id)) return jsonError(404, "Not found");

  const body = await request.json().catch(() => null);
  return employeeLifecycleResponse(await offboardEmployee(id, body), 200, canViewEmployeeCompensation(user));
});
