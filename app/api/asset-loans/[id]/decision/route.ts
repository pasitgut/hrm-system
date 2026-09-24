import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { assetLoans, assets } from "@/lib/db/schema";
import { requireApiRole, withApiAuth } from "@/lib/auth/dal";
import { fetchAssetLoanItemById, jsonError } from "@/app/api/asset-loans/_shared";

type RouteContext = { params: Promise<{ id: string }> };

const DECISIONS = new Set(["approved", "rejected"]);

// Gated the same way canApproveAssetLoan(role) resolves (supervisor/ceo);
// using requireApiRole with the literal role list directly here so there is
// a single place (this call) that decides who may decide an asset loan
// request — mirrors app/api/ot/[id]/decision/route.ts.
export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiRole(request, "supervisor", "ceo");
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
    .select({ id: assetLoans.id, assetId: assetLoans.assetId, statusCode: assetLoans.statusCode })
    .from(assetLoans)
    .where(eq(assetLoans.id, id));

  if (!existing) return jsonError(404, "Not found");
  if (existing.statusCode !== "pending") return jsonError(409, "Request has already been decided");

  const decisionNote: string | null = typeof note === "string" ? note : null;
  const now = new Date();

  // Approval also flips the linked asset's status to 'in_use' — done in the
  // same transaction so a loan can never end up approved against an asset
  // whose status update failed to apply. Rejection leaves the asset alone;
  // it was never marked in_use for a pending request.
  await db.transaction(async (tx) => {
    await tx
      .update(assetLoans)
      .set({
        statusCode: decision,
        decidedByEmployeeId: user.employeeId,
        decidedAt: now,
        decisionNote,
        updatedAt: now,
      })
      .where(eq(assetLoans.id, id));

    if (decision === "approved") {
      await tx.update(assets).set({ status: "in_use", updatedAt: now }).where(eq(assets.id, existing.assetId));
    }
  });

  const item = await fetchAssetLoanItemById(id);
  return NextResponse.json({ item });
});
