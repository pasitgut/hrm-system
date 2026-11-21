import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { leaveRequests } from "@/lib/db/schema";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { isSystemAdminSession } from "@/lib/auth/admin";
import { fetchLeaveItemById, jsonError } from "@/app/api/leave/_shared";

type RouteContext = { params: Promise<{ id: string }> };

const DECISIONS = new Set(["approved", "rejected"]);

export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiPermission(request, "leave.approve");
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

  const { decision, note } = body as Record<string, unknown>;
  if (typeof decision !== "string" || !DECISIONS.has(decision)) {
    return jsonError(400, "Invalid decision");
  }
  if (note != null && typeof note !== "string") {
    return jsonError(400, "Invalid note");
  }

  const [existing] = await db
    .select({ id: leaveRequests.id, statusCode: leaveRequests.statusCode })
    .from(leaveRequests)
    .where(eq(leaveRequests.id, id));

  if (!existing) return jsonError(404, "Not found");
  if (existing.statusCode !== "pending") return jsonError(409, "Request has already been decided");

  const decisionNote: string | null = typeof note === "string" ? note : null;

  const decidedAt = new Date();
  const [updated] = await db
    .update(leaveRequests)
    .set({
      statusCode: decision,
      decidedByEmployeeId: isSystemAdminSession(user) ? null : user.employeeId,
      decidedAt,
      decisionNote,
      updatedAt: decidedAt,
    })
    .where(and(
      eq(leaveRequests.id, id),
      eq(leaveRequests.statusCode, "pending"),
    ))
    .returning({ id: leaveRequests.id });

  if (!updated) return jsonError(409, "Request has already been decided");

  const item = await fetchLeaveItemById(id);
  return NextResponse.json({ item });
});
