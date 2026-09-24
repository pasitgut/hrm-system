import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { assetCategories } from "@/lib/db/schema";
import { requireApiRole, withApiAuth } from "@/lib/auth/dal";

// Settings module: edit a single asset category (including reactivating via
// isActive: true) and soft-deactivate it. Never a hard delete —
// assets.categoryId references this table, so DELETE only flips isActive
// to false; history stays intact.

type RouteContext = { params: Promise<{ id: string }> };

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function isUniqueViolation(error: unknown): boolean {
  // drizzle-orm wraps the original postgres error in a DrizzleQueryError,
  // exposing the real code via .cause, not directly on the caught error.
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "23505") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return typeof cause === "object" && cause !== null && (cause as { code?: unknown }).code === "23505";
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiRole(request, "supervisor", "ceo");
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return jsonError(400, "Invalid id");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }

  const { name, isActive } = body as Record<string, unknown>;
  const patch: Partial<typeof assetCategories.$inferInsert> = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) return jsonError(400, "name must be a non-empty string");
    patch.name = name.trim();
  }
  if (isActive !== undefined) {
    if (typeof isActive !== "boolean") return jsonError(400, "isActive must be a boolean");
    patch.isActive = isActive;
  }
  if (Object.keys(patch).length === 0) return jsonError(400, "No fields to update");

  try {
    const [item] = await db.update(assetCategories).set(patch).where(eq(assetCategories.id, id)).returning();
    if (!item) return jsonError(404, "Not found");
    return NextResponse.json({ item });
  } catch (error) {
    if (isUniqueViolation(error)) return jsonError(409, "An asset category with this name already exists");
    throw error;
  }
});

export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiRole(request, "supervisor", "ceo");
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return jsonError(400, "Invalid id");

  const [item] = await db
    .update(assetCategories)
    .set({ isActive: false })
    .where(eq(assetCategories.id, id))
    .returning();
  if (!item) return jsonError(404, "Not found");
  return NextResponse.json({ item });
});
