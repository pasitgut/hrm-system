import { asc } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { jsonError } from "@/lib/api/response";
import { isUniqueViolation } from "@/lib/db/errors";
import { leaveTypes } from "@/lib/db/schema";
import { requireApiPermission, requireApiUser, withApiAuth } from "@/lib/auth/dal";

// Read-only lookup endpoint: any authenticated account may list leave types
// (needed for the leave request form and reports). Write access lives in
// the settings module, added separately to this same file.

export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiUser(request);
  const items = await db.select().from(leaveTypes).orderBy(asc(leaveTypes.name));
  return NextResponse.json({ items });
});

// --- Settings module: create; the database assigns each code from a sequence.
// Edits and deactivation live in ./[code]/route.ts. Never hard-delete a type
// because leave requests reference its code. ---

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
  await requireApiPermission(request, "leave_types.manage");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }

  const { name, description, annualQuotaDays } = body as Record<string, unknown>;
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
        name: name.trim(),
        description: typeof description === "string" ? description.trim() || null : null,
        annualQuotaDays: (annualQuotaDays as number | null | undefined) ?? null,
        isActive: true,
      })
      .returning();
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return jsonError(409, "A leave type with this name already exists");
    throw error;
  }
});
