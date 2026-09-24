import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees, leaveRequests, leaveTypes } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { fetchLeaveItemById, jsonError, leaveDaySpan, leaveQuotaExceededMessage, parseLeaveInput } from "@/app/api/leave/_shared";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  const { id } = await context.params;

  const item = await fetchLeaveItemById(id);
  if (!item) return jsonError(404, "Not found");
  if (user.role === "employee" && item.employeeId !== user.employeeId) {
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

  const startYear = parsed.value.startOn.slice(0, 4);
  const startOfYear = `${startYear}-01-01`;
  const endOfYear = `${startYear}-12-31`;
  const requestedDays = leaveDaySpan(parsed.value.startOn, parsed.value.endOn, parsed.value.session);

  const result = await db.transaction(async (tx) => {
    await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, user.employeeId)).for("update");

    const [existing] = await tx
      .select({ employeeId: leaveRequests.employeeId, statusCode: leaveRequests.statusCode })
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id));
    if (!existing) return { error: "Not found", status: 404 as const };
    if (existing.employeeId !== user.employeeId) return { error: "Forbidden", status: 403 as const };
    if (existing.statusCode !== "pending") return { error: "Only a pending request can be edited", status: 409 as const };

    const [leaveType] = await tx
      .select({ name: leaveTypes.name, annualQuotaDays: leaveTypes.annualQuotaDays, isActive: leaveTypes.isActive })
      .from(leaveTypes)
      .where(eq(leaveTypes.code, parsed.value.leaveTypeCode));
    if (!leaveType?.isActive) return { error: "Unknown or inactive leave type", status: 400 as const };

    if (leaveType.annualQuotaDays != null) {
      const reservedRows = await tx
        .select({ startOn: leaveRequests.startOn, endOn: leaveRequests.endOn, session: leaveRequests.session })
        .from(leaveRequests)
        .where(and(
          eq(leaveRequests.employeeId, user.employeeId),
          eq(leaveRequests.leaveTypeCode, parsed.value.leaveTypeCode),
          inArray(leaveRequests.statusCode, ["approved", "pending"]),
          gte(leaveRequests.startOn, startOfYear),
          lte(leaveRequests.startOn, endOfYear),
          ne(leaveRequests.id, id),
        ));
      const reservedDays = reservedRows.reduce((total, row) => total + leaveDaySpan(row.startOn, row.endOn, row.session), 0);
      const remainingDays = leaveType.annualQuotaDays - reservedDays;
      if (requestedDays > remainingDays) {
        return { error: leaveQuotaExceededMessage(leaveType.name, requestedDays, remainingDays), status: 409 as const };
      }
    }

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
