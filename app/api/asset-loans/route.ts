import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { assetLoans, assets } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import {
  assetLoanBaseSelect,
  fetchAssetLoanItemById,
  isValidDateStr,
  jsonError,
  toAssetLoanItemDto,
} from "@/app/api/asset-loans/_shared";

const STATUS_VALUES = new Set(["all", "pending", "approved", "rejected"]);

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const searchParams = request.nextUrl.searchParams;

  const statusParam = searchParams.get("status") ?? "all";
  if (!STATUS_VALUES.has(statusParam)) {
    return jsonError(400, "Invalid status");
  }

  const employeeIdParam = searchParams.get("employeeId");

  let scopedEmployeeId: string | undefined;
  if (user.role === "employee") {
    if (employeeIdParam && employeeIdParam !== user.employeeId) {
      return jsonError(403, "Forbidden");
    }
    scopedEmployeeId = user.employeeId;
  } else {
    scopedEmployeeId = employeeIdParam ?? undefined;
  }

  const conditions = [];
  if (statusParam !== "all") conditions.push(eq(assetLoans.statusCode, statusParam));
  if (scopedEmployeeId) conditions.push(eq(assetLoans.employeeId, scopedEmployeeId));

  const rows = await assetLoanBaseSelect()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(assetLoans.createdAt));

  return NextResponse.json({ items: rows.map(toAssetLoanItemDto) });
});

// Always creates the request for the caller's own employee — there is no
// employeeId override here (unlike OT's optional-but-must-match-self body
// field), since asset borrowing is exclusively self-service.
export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }

  const { assetId, checkoutDate, dueDate, purpose } = body as Record<string, unknown>;

  if (typeof assetId !== "string" || !assetId) return jsonError(400, "assetId is required");
  if (!isValidDateStr(checkoutDate) || !isValidDateStr(dueDate)) return jsonError(400, "Invalid checkoutDate/dueDate");
  if (checkoutDate > dueDate) return jsonError(400, "checkoutDate must be on or before dueDate");
  if (purpose != null && typeof purpose !== "string") return jsonError(400, "Invalid purpose");

  const [asset] = await db.select({ id: assets.id, status: assets.status }).from(assets).where(eq(assets.id, assetId));
  if (!asset) return jsonError(404, "Asset not found");
  if (asset.status !== "available") return jsonError(409, "Asset is not available");

  const [inserted] = await db
    .insert(assetLoans)
    .values({
      assetId,
      employeeId: user.employeeId,
      checkoutDate,
      dueDate,
      purpose: typeof purpose === "string" ? purpose.trim() : null,
      statusCode: "pending",
    })
    .returning({ id: assetLoans.id });

  const item = await fetchAssetLoanItemById(inserted.id);
  return NextResponse.json({ item }, { status: 201 });
});
