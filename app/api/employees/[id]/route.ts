import { NextResponse, type NextRequest } from "next/server";
import { requireApiRole, requireApiUser, withApiAuth } from "@/lib/auth/dal";
import {
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
  await requireApiUser(request);
  const { id } = await context.params;
  if (!isValidUuid(id)) return jsonError(404, "Not found");

  const item = await fetchEmployeeItemById(id);
  if (!item) return jsonError(404, "Not found");
  return NextResponse.json({ item });
});

// PATCH is the HTTP adapter for the shared employee update operation.
export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiRole(request, "supervisor", "ceo");
  const { id } = await context.params;
  if (!isValidUuid(id)) return jsonError(404, "Not found");
  if (!(await employeeExists(id))) return jsonError(404, "Not found");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  return employeeLifecycleResponse(await updateEmployee(id, body));
});

// DELETE offboards through the shared lifecycle operation.
export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiRole(request, "supervisor", "ceo");
  const { id } = await context.params;
  if (!isValidUuid(id)) return jsonError(404, "Not found");

  const body = await request.json().catch(() => null);
  return employeeLifecycleResponse(await offboardEmployee(id, body));
});
