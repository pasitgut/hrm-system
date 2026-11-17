import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees, leaveRequests } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canManageOwnLeaveRequests, canViewCompanyLeave, canViewOwnLeaveRequests } from "@/lib/auth/permissions";
import { fetchLeaveItemById, jsonError, parseLeaveInput } from "@/app/api/leave/_shared";
import { checkLeaveQuota } from "@/app/api/leave/_quota";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  if (!canViewOwnLeaveRequests(user.permissions) && !canViewCompanyLeave(user.permissions)) {
    return jsonError(403, "Leave view permission required");
  }
  const { id } = await context.params;

  const item = await fetchLeaveItemById(id);
  if (!item) return jsonError(404, "Not found");
  if (!canViewCompanyLeave(user.permissions) && item.employeeId !== user.employeeId) {
    return jsonError(403, "Forbidden");
  }

  return NextResponse.json({ item });
});

// Edit own request — only while it is still pending (own employee, not
// approved/rejected/cancelled). Same validation as POST.
export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }

  const parsed = parseLeaveInput(body as Record<string, unknown>);
  // Explicit `=== false` (not `!parsed.ok`) — this TypeScript 7 preview
  // compiler doesn't narrow a discriminated union through `!` negation.
  if (parsed.ok === false) {
    return jsonError(400, parsed.message);
  }

  const result = await db.transaction(async (tx) => {
    const [employee] = await tx.select({ id: employees.id, startDate: employees.startDate }).from(employees).where(eq(employees.id, user.employeeId)).for("update");

    const [existing] = await tx
      .select({ employeeId: leaveRequests.employeeId, statusCode: leaveRequests.statusCode })
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id));
    if (!existing) return { error: "Not found", status: 404 as const };
    if (existing.employeeId !== user.employeeId) return { error: "Forbidden", status: 403 as const };
    if (!canManageOwnLeaveRequests(user.permissions)) return { error: "Leave self-service permission required", status: 403 as const };
    if (existing.statusCode !== "pending") return { error: "Only a pending request can be edited", status: 409 as const };

    const quotaFailure = await checkLeaveQuota({
      tx,
      employeeId: user.employeeId,
      employeeStartDate: employee?.startDate,
      excludeRequestId: id,
      ...parsed.value,
    });
    if (quotaFailure) return quotaFailure;

    const updatedAt = new Date();
    const [updated] = await tx
      .update(leaveRequests)
      .set({
        leaveTypeCode: parsed.value.leaveTypeCode,
        startOn: parsed.value.startOn,
        endOn: parsed.value.endOn,
        session: parsed.value.session,
        reason: parsed.value.reason,
        updatedAt,
      })
      .where(and(
        eq(leaveRequests.id, id),
        eq(leaveRequests.employeeId, user.employeeId),
        eq(leaveRequests.statusCode, "pending"),
      ))
      .returning({ id: leaveRequests.id });
    if (!updated) return { error: "Only a pending request can be edited", status: 409 as const };
    return { id: updated.id };
  });

  if ("error" in result) return jsonError(result.status, result.error);

  const item = await fetchLeaveItemById(result.id);
  return NextResponse.json({ item });
});

// Soft-cancel own request — only while pending. Never a hard row delete:
// sets statusCode/cancelledByEmployeeId/cancelledAt instead.
export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  const { id } = await context.params;

  const [existing] = await db
    .select({ id: leaveRequests.id, employeeId: leaveRequests.employeeId, statusCode: leaveRequests.statusCode })
    .from(leaveRequests)
    .where(eq(leaveRequests.id, id));

  if (!existing) return jsonError(404, "Not found");
  if (existing.employeeId !== user.employeeId) return jsonError(403, "Forbidden");
  if (!canManageOwnLeaveRequests(user.permissions)) return jsonError(403, "Leave self-service permission required");
  if (existing.statusCode !== "pending") return jsonError(409, "Only a pending request can be cancelled");

  const cancelledAt = new Date();
  const [updated] = await db
    .update(leaveRequests)
    .set({
      statusCode: "cancelled",
      cancelledByEmployeeId: user.employeeId,
      cancelledAt,
      updatedAt: cancelledAt,
    })
    .where(and(
      eq(leaveRequests.id, id),
      eq(leaveRequests.employeeId, user.employeeId),
      eq(leaveRequests.statusCode, "pending"),
    ))
    .returning({ id: leaveRequests.id });

  if (!updated) return jsonError(409, "Only a pending request can be cancelled");

  const item = await fetchLeaveItemById(id);
  return NextResponse.json({ item });
});
