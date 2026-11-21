import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { decideLeave } from "@/lib/leave/commands";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
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

  const decisionNote = typeof note === "string" ? note : null;
  const result = await db.transaction((tx) => decideLeave(tx, user, id, decision as "approved" | "rejected", decisionNote));
  if ("error" in result) return jsonError(result.status, result.error);

  const item = await fetchLeaveItemById(id);
  return NextResponse.json({ item });
});
