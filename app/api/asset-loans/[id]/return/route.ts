import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { assetLoans, assets } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canApproveAssetLoan } from "@/lib/auth/permissions";
import { fetchAssetLoanItemById, jsonError } from "@/app/api/asset-loans/_shared";

type RouteContext = { params: Promise<{ id: string }> };

// Callable by either the loan's own employee (returning their own gear) or
// anyone canApproveAssetLoan(role) covers (front-desk-style processing of
// someone else's return). Requires the loan to currently be an active
// approved loan (statusCode='approved' AND returnedAt IS NULL) — 409 for
// anything else (still pending, rejected, cancelled, or already returned).
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

  const { returnNote } = body as Record<string, unknown>;
  if (returnNote != null && typeof returnNote !== "string") {
    return jsonError(400, "Invalid returnNote");
  }

  const [existing] = await db
    .select({
      id: assetLoans.id,
      assetId: assetLoans.assetId,
      employeeId: assetLoans.employeeId,
      statusCode: assetLoans.statusCode,
      returnedAt: assetLoans.returnedAt,
    })
    .from(assetLoans)
    .where(eq(assetLoans.id, id));

  if (!existing) return jsonError(404, "Not found");
  if (existing.employeeId !== user.employeeId && !canApproveAssetLoan(user.role)) {
    return jsonError(403, "Forbidden");
  }
  if (existing.statusCode !== "approved" || existing.returnedAt !== null) {
    return jsonError(409, "Loan is not an active approved loan");
  }

  const now = new Date();
  const note: string | null = typeof returnNote === "string" ? returnNote : null;

  // Same transaction as the decision route's approval: the loan's return and
  // the asset flipping back to 'available' must land together.
  await db.transaction(async (tx) => {
    await tx
      .update(assetLoans)
      .set({ returnedAt: now, returnNote: note, updatedAt: now })
      .where(eq(assetLoans.id, id));

    await tx.update(assets).set({ status: "available", updatedAt: now }).where(eq(assets.id, existing.assetId));
  });

  const item = await fetchAssetLoanItemById(id);
  return NextResponse.json({ item });
});
