import { asc } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { positions } from "@/lib/db/schema";
import { requireApiRole, requireApiUser, withApiAuth } from "@/lib/auth/dal";

// Read-only lookup endpoint: any authenticated role may list positions
// (needed for dropdowns across the app). Write access (add/edit/delete)
// lives in the settings module, added separately to this same file.

export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiUser(request);
  const items = await db.select().from(positions).orderBy(asc(positions.name));
  return NextResponse.json({ items });
});

// --- Settings module: create (supervisor/ceo only). Edit/delete live in
// ./[id]/route.ts. DELETE removes the lookup row and clears employee refs. ---

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

  const { name } = body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) {
    return jsonError(400, "name is required");
  }

  try {
    const [item] = await db.insert(positions).values({ name: name.trim(), isActive: true }).returning();
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return jsonError(409, "A position with this name already exists");
    throw error;
  }
});
