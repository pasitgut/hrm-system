import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canManageEmployeeCompensation } from "@/lib/auth/rolePermissionAccess";
import {
  createEmployee,
  employeeLifecycleResponse,
  fetchActiveEmployeeItems,
  fetchAllEmployeeItems,
  jsonError,
} from "@/app/api/employees/_shared";

// GET: any authenticated account may list the employee directory. Excludes
// soft-deleted (off-boarded) rows by default; accounts with employees.manage
// may pass includeDeleted=true to also see off-boarded employees.
export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const includeDeleted = request.nextUrl.searchParams.get("includeDeleted") === "true";

  if (includeDeleted && !canManageEmployeeCompensation(user)) {
    return jsonError(403, "Forbidden");
  }

  const includeCompensation = canManageEmployeeCompensation(user);
  const items = includeDeleted
    ? await fetchAllEmployeeItems(includeCompensation)
    : await fetchActiveEmployeeItems(includeCompensation);
  return NextResponse.json({ items });
});

// POST is the HTTP adapter for the shared employee lifecycle operation.
export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canManageEmployeeCompensation(user)) return jsonError(403, "Forbidden");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  return employeeLifecycleResponse(await createEmployee(body), 201);
});
