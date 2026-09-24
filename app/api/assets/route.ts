import { and, asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { assetCategories, assets, type assetStatusEnum } from "@/lib/db/schema";
import { requireApiRole, requireApiUser, withApiAuth } from "@/lib/auth/dal";
import {
  ASSET_STATUS_VALUES,
  assetBaseSelect,
  fetchAssetItemById,
  generateAssetCode,
  isUniqueViolation,
  jsonError,
  toAssetItemDto,
} from "@/app/api/assets/_shared";

type AssetStatus = (typeof assetStatusEnum.enumValues)[number];

// Any authenticated role may list assets — borrowing requires seeing what's
// currently available, not just supervisors/ceo managing inventory.
export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiUser(request);
  const searchParams = request.nextUrl.searchParams;

  const statusParam = searchParams.get("status");
  if (statusParam && !ASSET_STATUS_VALUES.has(statusParam)) {
    return jsonError(400, "Invalid status");
  }

  const categoryIdParam = searchParams.get("categoryId");
  let categoryId: number | undefined;
  if (categoryIdParam != null) {
    categoryId = Number(categoryIdParam);
    if (!Number.isInteger(categoryId)) return jsonError(400, "Invalid categoryId");
  }

  const conditions = [];
  if (statusParam) conditions.push(eq(assets.status, statusParam as AssetStatus));
  if (categoryId != null) conditions.push(eq(assets.categoryId, categoryId));

  const rows = await assetBaseSelect()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(assets.code));

  return NextResponse.json({ items: rows.map(toAssetItemDto) });
});

// Gated the same way canManageAssets(role) resolves (supervisor/ceo); using
// requireApiRole with the literal role list directly here so there is a
// single place (this call) that decides who may add asset master data.
export const POST = withApiAuth(async (request: NextRequest) => {
  await requireApiRole(request, "supervisor", "ceo");

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

  if (typeof name !== "string" || !name.trim()) return jsonError(400, "Name is required");
  if (typeof categoryId !== "number" || !Number.isInteger(categoryId)) return jsonError(400, "Invalid categoryId");
  if (code != null && (typeof code !== "string" || !code.trim())) return jsonError(400, "Invalid code");
  if (serialNumber != null && typeof serialNumber !== "string") return jsonError(400, "Invalid serialNumber");
  if (status != null && (typeof status !== "string" || !ASSET_STATUS_VALUES.has(status))) return jsonError(400, "Invalid status");
  if (notes != null && typeof notes !== "string") return jsonError(400, "Invalid notes");

  const [category] = await db.select({ id: assetCategories.id }).from(assetCategories).where(eq(assetCategories.id, categoryId));
  if (!category) return jsonError(400, "Unknown categoryId");

  const finalCode = typeof code === "string" && code.trim() ? code.trim() : await generateAssetCode();
  const finalSerialNumber = typeof serialNumber === "string" && serialNumber.trim() ? serialNumber.trim() : null;

  let inserted;
  try {
    [inserted] = await db
      .insert(assets)
      .values({
        code: finalCode,
        name: name.trim(),
        categoryId,
        serialNumber: finalSerialNumber,
        status: (status as AssetStatus | undefined) ?? "available",
        notes: typeof notes === "string" ? notes : null,
      })
      .returning({ id: assets.id });
  } catch (error) {
    if (isUniqueViolation(error)) return jsonError(409, "Asset code or serial number is already in use");
    throw error;
  }

  const item = await fetchAssetItemById(inserted.id);
  return NextResponse.json({ item }, { status: 201 });
});
