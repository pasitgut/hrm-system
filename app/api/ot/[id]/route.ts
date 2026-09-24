import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { overtimeRequests } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import {
  bangkokToUtcDate,
  fetchOtItemById,
  isValidDateStr,
  isValidTimeStr,
  jsonError,
} from "@/app/api/ot/_shared";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  const { id } = await context.params;

  const item = await fetchOtItemById(id);
  if (!item) return jsonError(404, "Not found");
  if (user.role === "employee" && item.employeeId !== user.employeeId) {
    return jsonError(403, "Forbidden");
  }

  return NextResponse.json({ item });
});

// Edit own pending request. Only the owning employee may edit (403 for
// anyone else, including supervisor/ceo — editing is not a supervisor
// action), and only while still pending (409 once decided).
export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  const { id } = await context.params;

  const [existing] = await db
    .select({ id: overtimeRequests.id, employeeId: overtimeRequests.employeeId, statusCode: overtimeRequests.statusCode })
    .from(overtimeRequests)
    .where(eq(overtimeRequests.id, id));

  if (!existing) return jsonError(404, "Not found");
  if (existing.employeeId !== user.employeeId) return jsonError(403, "Forbidden");
  if (existing.statusCode !== "pending") return jsonError(409, "Request has already been decided");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }

  const { date, startTime, endTime, reason } = body as Record<string, unknown>;

  if (!isValidDateStr(date) || !isValidTimeStr(startTime) || !isValidTimeStr(endTime)) {
    return jsonError(400, "Invalid date/time");
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return jsonError(400, "Reason is required");
  }

  const startAt = bangkokToUtcDate(date, startTime);
  const endAt = bangkokToUtcDate(date, endTime);
  if (endAt <= startAt) {
    return jsonError(400, "endTime must be after startTime");
  }

  await db
    .update(overtimeRequests)
    .set({ startAt, endAt, reason: reason.trim(), updatedAt: new Date() })
    .where(eq(overtimeRequests.id, id));

  const item = await fetchOtItemById(id);
  return NextResponse.json({ item });
});

// Soft-cancel own pending request. Only the owning employee (403 otherwise),
// only while pending (409 otherwise). Never a hard delete — sets
// cancelledByEmployeeId/cancelledAt, mirroring the decision fields' shape.
export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  const { id } = await context.params;

  const [existing] = await db
    .select({ id: overtimeRequests.id, employeeId: overtimeRequests.employeeId, statusCode: overtimeRequests.statusCode })
    .from(overtimeRequests)
    .where(eq(overtimeRequests.id, id));

  if (!existing) return jsonError(404, "Not found");
  if (existing.employeeId !== user.employeeId) return jsonError(403, "Forbidden");
  if (existing.statusCode !== "pending") return jsonError(409, "Request has already been decided");

  await db
    .update(overtimeRequests)
    .set({
      statusCode: "cancelled",
      cancelledByEmployeeId: user.employeeId,
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(overtimeRequests.id, id));

  const item = await fetchOtItemById(id);
  return NextResponse.json({ item });
});
