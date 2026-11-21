import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees, leaveRequests, leaveTypes, requestStatuses } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canManageOwnLeaveRequests, canViewCompanyLeave, canViewOwnLeaveRequests } from "@/lib/auth/permissions";
import {
  fetchLeaveItemById,
  jsonError,
  leaveSelectColumns,
  parseLeaveInput,
  toLeaveItemDto,
} from "@/app/api/leave/_shared";
import { createLeave } from "@/lib/leave/commands";

const STATUS_VALUES = new Set(["all", "pending", "approved", "rejected"]);

// Leave isn't calendar-scoped like OT (no `month` param), so the dashboard
// needs the complete set for its calendar and year-to-date summaries.

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canViewOwnLeaveRequests(user.permissions) && !canViewCompanyLeave(user.permissions)) {
    return jsonError(403, "Leave view permission required");
  }
  const searchParams = request.nextUrl.searchParams;

  const statusParam = searchParams.get("status") ?? "all";
  if (!STATUS_VALUES.has(statusParam)) {
    return jsonError(400, "Invalid status");
  }

  const employeeIdParam = searchParams.get("employeeId");

  let scopedEmployeeId: string | undefined;
  if (!canViewCompanyLeave(user.permissions)) {
    if (employeeIdParam && employeeIdParam !== user.employeeId) {
      return jsonError(403, "Forbidden");
    }
    scopedEmployeeId = user.employeeId;
  } else {
    scopedEmployeeId = employeeIdParam ?? undefined;
  }

  const conditions = [];
  if (statusParam !== "all") conditions.push(eq(leaveRequests.statusCode, statusParam));
  if (scopedEmployeeId) conditions.push(eq(leaveRequests.employeeId, scopedEmployeeId));

  const rows = await db
    .select(leaveSelectColumns)
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeCode, leaveTypes.code))
    .innerJoin(requestStatuses, eq(leaveRequests.statusCode, requestStatuses.code))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(leaveRequests.createdAt));

  return NextResponse.json({ items: rows.map(toLeaveItemDto) });
});

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canManageOwnLeaveRequests(user.permissions)) return jsonError(403, "Leave self-service permission required");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }

  const { employeeId } = body as Record<string, unknown>;
  if (employeeId != null && employeeId !== user.employeeId) {
    return jsonError(400, "Cannot create a leave request for another employee");
  }

  const parsed = parseLeaveInput(body as Record<string, unknown>);
  // Explicit `=== false` (not `!parsed.ok`) — this TypeScript 7 preview
  // compiler doesn't narrow a discriminated union through `!` negation.
  if (parsed.ok === false) {
    return jsonError(400, parsed.message);
  }

  const result = await db.transaction((tx) => createLeave(tx, user, parsed.value));

  if ("error" in result) return jsonError(result.status, result.error);
  const item = await fetchLeaveItemById(result.id);
  return NextResponse.json({ item }, { status: 201 });
});
