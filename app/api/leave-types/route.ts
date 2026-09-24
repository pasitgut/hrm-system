import { asc } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { leaveTypes } from "@/lib/db/schema";
import { requireApiRole, requireApiUser, withApiAuth } from "@/lib/auth/dal";

// Read-only lookup endpoint: any authenticated role may list leave types
// (needed for the leave request form and reports). Write access lives in
// the settings module, added separately to this same file.

export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiUser(request);
  const items = await db.select().from(leaveTypes).orderBy(asc(leaveTypes.name));
  return NextResponse.json({ items });
});

// --- Settings module: create (supervisor/ceo only). Edit/deactivate live in
// ./[code]/route.ts (the PK is `code`, client-supplied, not an identity
// column). Never a hard delete — leave_requests.leaveTypeCode references
// this table, so deactivation only ever flips isActive. ---

const CODE_PATTERN = /^[a-zA-Z0-9_-]+$/;

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

// Returns an error message, or null when the value is a valid optional
// annualQuotaDays: absent, null (uncapped), or a non-negative integer.
function invalidQuotaMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return "annualQuotaDays must be a non-negative integer or null";
  }
  return null;
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

  const { code, name, description, annualQuotaDays } = body as Record<string, unknown>;
  if (typeof code !== "string" || !code.trim() || !CODE_PATTERN.test(code.trim())) {
    return jsonError(400, "code is required and must contain only letters, numbers, - or _");
  }
  if (typeof name !== "string" || !name.trim()) {
    return jsonError(400, "name is required");
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return jsonError(400, "description must be a string or null");
  }
  const quotaError = invalidQuotaMessage(annualQuotaDays);
  if (quotaError) return jsonError(400, quotaError);

  try {
    const [item] = await db
      .insert(leaveTypes)
      .values({
        code: code.trim(),
        name: name.trim(),
        description: typeof description === "string" ? description.trim() || null : null,
        annualQuotaDays: (annualQuotaDays as number | null | undefined) ?? null,
        isActive: true,
      })
      .returning();
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return jsonError(409, "A leave type with this code or name already exists");
    throw error;
  }
});
