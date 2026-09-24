import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { assetLoans } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { fetchAssetLoanItemById, jsonError } from "@/app/api/asset-loans/_shared";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  const { id } = await context.params;

  const item = await fetchAssetLoanItemById(id);
  if (!item) return jsonError(404, "Not found");
  if (user.role === "employee" && item.employeeId !== user.employeeId) {
    return jsonError(403, "Forbidden");
  }

  return NextResponse.json({ item });
});

// Soft-cancel: only the loan's own employee may cancel it, and only while it
// is still pending (409 otherwise — an already-decided request can't be
// withdrawn this way).
export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  const { id } = await context.params;

  const [existing] = await db
    .select({ id: assetLoans.id, employeeId: assetLoans.employeeId, statusCode: assetLoans.statusCode })
    .from(assetLoans)
    .where(eq(assetLoans.id, id));

  if (!existing) return jsonError(404, "Not found");
  if (existing.employeeId !== user.employeeId) return jsonError(403, "Forbidden");
  if (existing.statusCode !== "pending") return jsonError(409, "Request has already been decided");

  await db
    .update(assetLoans)
    .set({
      statusCode: "cancelled",
      cancelledByEmployeeId: user.employeeId,
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(assetLoans.id, id));

  const item = await fetchAssetLoanItemById(id);
  return NextResponse.json({ item });
});
