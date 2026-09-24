import { and, eq, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { assetCategories, assetLoans, assets, type assetStatusEnum } from "@/lib/db/schema";
import { requireApiRole, requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { ASSET_STATUS_VALUES, fetchAssetItemById, isUniqueViolation, jsonError } from "@/app/api/assets/_shared";

type AssetStatus = (typeof assetStatusEnum.enumValues)[number];
type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiUser(request);
  const { id } = await context.params;

  const item = await fetchAssetItemById(id);
  if (!item) return jsonError(404, "Not found");

  return NextResponse.json({ item });
});

// Gated the same way canManageAssets(role) resolves (supervisor/ceo).
export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiRole(request, "supervisor", "ceo");
  const { id } = await context.params;

  const [existing] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, id));
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

  const { code, name, categoryId, serialNumber, status, notes } = body as Record<string, unknown>;

  const patch: Partial<typeof assets.$inferInsert> = {};

  if (code !== undefined) {
    if (typeof code !== "string" || !code.trim()) return jsonError(400, "Invalid code");
    patch.code = code.trim();
  }
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) return jsonError(400, "Invalid name");
    patch.name = name.trim();
  }
  if (categoryId !== undefined) {
    if (typeof categoryId !== "number" || !Number.isInteger(categoryId)) return jsonError(400, "Invalid categoryId");
    const [category] = await db.select({ id: assetCategories.id }).from(assetCategories).where(eq(assetCategories.id, categoryId));
    if (!category) return jsonError(400, "Unknown categoryId");
    patch.categoryId = categoryId;
  }
  if (serialNumber !== undefined) {
    if (serialNumber !== null && typeof serialNumber !== "string") return jsonError(400, "Invalid serialNumber");
    patch.serialNumber = typeof serialNumber === "string" && serialNumber.trim() ? serialNumber.trim() : null;
  }
  if (status !== undefined) {
    if (typeof status !== "string" || !ASSET_STATUS_VALUES.has(status)) return jsonError(400, "Invalid status");
    patch.status = status as AssetStatus;
  }
  if (notes !== undefined) {
    if (notes !== null && typeof notes !== "string") return jsonError(400, "Invalid notes");
    patch.notes = typeof notes === "string" ? notes : null;
  }

  if (Object.keys(patch).length === 0) return jsonError(400, "No fields to update");

  try {
    await db.update(assets).set({ ...patch, updatedAt: new Date() }).where(eq(assets.id, id));
  } catch (error) {
    if (isUniqueViolation(error)) return jsonError(409, "Asset code or serial number is already in use");
    throw error;
  }

  const item = await fetchAssetItemById(id);
  return NextResponse.json({ item });
});

// Soft-retire: sets status='retired' rather than deleting the row (loan
// history references it via a FK). Gated the same way canManageAssets(role)
// resolves (supervisor/ceo). 409 if the asset is currently on an active loan
// (statusCode='approved' AND returnedAt IS NULL) — can't retire something
// checked out.
export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiRole(request, "supervisor", "ceo");
  const { id } = await context.params;

  const [existing] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, id));
  if (!existing) return jsonError(404, "Not found");

  const [activeLoan] = await db
    .select({ id: assetLoans.id })
    .from(assetLoans)
    .where(and(eq(assetLoans.assetId, id), eq(assetLoans.statusCode, "approved"), isNull(assetLoans.returnedAt)));
  if (activeLoan) return jsonError(409, "Asset has an active loan and cannot be retired");

  await db.update(assets).set({ status: "retired", updatedAt: new Date() }).where(eq(assets.id, id));

  const item = await fetchAssetItemById(id);
  return NextResponse.json({ item });
});
