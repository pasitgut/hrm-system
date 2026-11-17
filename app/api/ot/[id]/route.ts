import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { overtimeRequests } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canViewCompanyOtData } from "@/lib/auth/rolePermissionAccess";
import { canManageOwnOtRequests, canViewOwnOtRequests } from "@/lib/auth/permissions";
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
  if (!canViewOwnOtRequests(user.permissions) && !canViewCompanyOtData(user)) {
    return jsonError(403, "OT view permission required");
  }
  const { id } = await context.params;

  const item = await fetchOtItemById(id);
  if (!item) return jsonError(404, "Not found");
  if (!canViewCompanyOtData(user) && item.employeeId !== user.employeeId) {
    return jsonError(403, "Forbidden");
  }

  return NextResponse.json({ item });
});

// Edit own pending requests.
export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  const { id } = await context.params;

  const [existing] = await db
    .select({ id: overtimeRequests.id, employeeId: overtimeRequests.employeeId, statusCode: overtimeRequests.statusCode })
    .from(overtimeRequests)
    .where(eq(overtimeRequests.id, id));

  if (!existing) return jsonError(404, "Not found");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }

  const bodyRecord = body as Record<string, unknown>;
  if (existing.employeeId !== user.employeeId) return jsonError(403, "Forbidden");
  if (!canManageOwnOtRequests(user.permissions)) return jsonError(403, "OT self-service permission required");
  if (existing.statusCode !== "pending") return jsonError(409, "Request has already been decided");

  const { date, startTime, endTime, reason } = bodyRecord;

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
  if (!canManageOwnOtRequests(user.permissions)) return jsonError(403, "OT self-service permission required");
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
