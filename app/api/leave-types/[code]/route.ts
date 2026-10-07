import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { leaveTypes } from "@/lib/db/schema";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";

// Settings module: edit a single leave type (including reactivating via
// isActive: true) and soft-deactivate it. The generated code is immutable
// because leave requests reference it; DELETE only flips isActive.

type RouteContext = { params: Promise<{ code: string }> };

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

function invalidQuotaMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return "annualQuotaDays must be a non-negative integer or null";
  }
  return null;
}

export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiPermission(request, "leave_types.manage");
  const { code } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }

  const { name, description, annualQuotaDays, isActive } = body as Record<string, unknown>;
  const patch: Partial<typeof leaveTypes.$inferInsert> = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) return jsonError(400, "name must be a non-empty string");
    patch.name = name.trim();
  }
  if (description !== undefined) {
    if (description !== null && typeof description !== "string") return jsonError(400, "description must be a string or null");
    patch.description = typeof description === "string" ? description.trim() || null : null;
  }
  if (annualQuotaDays !== undefined) {
    const quotaError = invalidQuotaMessage(annualQuotaDays);
    if (quotaError) return jsonError(400, quotaError);
    patch.annualQuotaDays = annualQuotaDays as number | null;
  }
  if (isActive !== undefined) {
    if (typeof isActive !== "boolean") return jsonError(400, "isActive must be a boolean");
    patch.isActive = isActive;
  }
  if (Object.keys(patch).length === 0) return jsonError(400, "No fields to update");

  try {
    const [item] = await db.update(leaveTypes).set(patch).where(eq(leaveTypes.code, code)).returning();
    if (!item) return jsonError(404, "Not found");
    return NextResponse.json({ item });
  } catch (error) {
    if (isUniqueViolation(error)) return jsonError(409, "A leave type with this name already exists");
    throw error;
  }
});

export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiPermission(request, "leave_types.manage");
  const { code } = await context.params;

  const [item] = await db.update(leaveTypes).set({ isActive: false }).where(eq(leaveTypes.code, code)).returning();
  if (!item) return jsonError(404, "Not found");
  return NextResponse.json({ item });
});
