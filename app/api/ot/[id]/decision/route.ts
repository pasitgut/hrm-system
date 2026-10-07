import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { overtimeRequests } from "@/lib/db/schema";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { fetchOtItemById, jsonError } from "@/app/api/ot/_shared";

type RouteContext = { params: Promise<{ id: string }> };

const DECISIONS = new Set(["approved", "rejected"]);

export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiPermission(request, "ot.approve");
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
    .select({ id: overtimeRequests.id, statusCode: overtimeRequests.statusCode })
    .from(overtimeRequests)
    .where(eq(overtimeRequests.id, id));

  if (!existing) return jsonError(404, "Not found");
  if (existing.statusCode !== "pending") return jsonError(409, "Request has already been decided");

  const decisionNote: string | null = typeof note === "string" ? note : null;

  await db
    .update(overtimeRequests)
    .set({
      statusCode: decision,
      decidedByEmployeeId: user.employeeId,
      decidedAt: new Date(),
      decisionNote,
      updatedAt: new Date(),
    })
    .where(eq(overtimeRequests.id, id));

  const item = await fetchOtItemById(id);
  return NextResponse.json({ item });
});
