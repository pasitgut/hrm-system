import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { assetCategories, assets } from "@/lib/db/schema";

// Shared helpers for the app/api/assets/** Route Handlers: the GET /api/assets
// response DTO, the joined select used to build it, and asset-code generation.
// Not a route itself (no HTTP method exports), so Next.js ignores this file
// for routing purposes.

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export const ASSET_STATUS_VALUES = new Set(["available", "in_use", "maintenance", "retired"]);

// Columns for the standard category join used by every asset read.
export const assetSelectColumns = {
  id: assets.id,
  code: assets.code,
  name: assets.name,
  categoryId: assets.categoryId,
  categoryName: assetCategories.name,
  serialNumber: assets.serialNumber,
  status: assets.status,
  notes: assets.notes,
  createdAt: assets.createdAt,
  updatedAt: assets.updatedAt,
} as const;

type AssetRow = {
  id: string;
  code: string;
  name: string;
  categoryId: number;
  categoryName: string;
  serialNumber: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AssetItemDto = ReturnType<typeof toAssetItemDto>;

export function toAssetItemDto(row: AssetRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    serialNumber: row.serialNumber,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function assetBaseSelect() {
  return db
    .select(assetSelectColumns)
    .from(assets)
    .innerJoin(assetCategories, eq(assets.categoryId, assetCategories.id));
}

export async function fetchAssetItemById(id: string): Promise<AssetItemDto | null> {
  const [row] = await assetBaseSelect().where(eq(assets.id, id));
  return row ? toAssetItemDto(row) : null;
}

// Server-generated fallback code when POST /api/assets omits `code`:
// "AST-###", zero-padded to 3 digits, picking the first unused number at or
// after (current row count + 1). Good enough for this app's write volume —
// asset creation is an infrequent admin action, not a hot path.
export async function generateAssetCode(): Promise<string> {
  const [{ value }] = await db.select({ value: sql<number>`count(*)::int` }).from(assets);
  const base = Number(value) + 1;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const code = `AST-${String(base + attempt).padStart(3, "0")}`;
    const [existing] = await db.select({ id: assets.id }).from(assets).where(eq(assets.code, code)).limit(1);
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique asset code");
}

// postgres.js surfaces a Postgres unique-violation as an error with
// `.code === "23505"` — used to turn a duplicate code/serialNumber insert
// into a 409 instead of a 500. drizzle-orm wraps it in a DrizzleQueryError,
// exposing the real code via `.cause`, not directly on the caught error.
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "23505") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return typeof cause === "object" && cause !== null && (cause as { code?: unknown }).code === "23505";
}
