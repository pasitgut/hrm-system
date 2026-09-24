import { NextResponse, type NextRequest } from "next/server";
import { requireApiRole, requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canManageEmployees } from "@/lib/auth/permissions";
import {
  createEmployee,
  employeeLifecycleResponse,
  fetchActiveEmployeeItems,
  fetchAllEmployeeItems,
  jsonError,
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

// POST is the HTTP adapter for the shared employee lifecycle operation.
export const POST = withApiAuth(async (request: NextRequest) => {
  await requireApiRole(request, "supervisor", "ceo");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  return employeeLifecycleResponse(await createEmployee(body), 201);
});
