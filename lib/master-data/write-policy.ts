import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { postgresErrorCode } from "@/lib/db/errors";
import { departments, employmentStatuses, employmentTypes, positions } from "@/lib/db/schema";

type LookupTable = typeof departments | typeof positions | typeof employmentTypes | typeof employmentStatuses;

export function masterDataError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function readMasterDataBody(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false as const, response: masterDataError(400, "Invalid JSON body") };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false as const, response: masterDataError(400, "Invalid request body") };
  }
  return { ok: true as const, body: body as Record<string, unknown> };
}

export function trimmedString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false as const, response: masterDataError(400, message) };
  }
  return { ok: true as const, value: value.trim() };
}

export function optionalTrimmedString(value: unknown, message: string) {
  if (value === undefined) return { ok: true as const, value: undefined };
  return trimmedString(value, message);
}

export function optionalBoolean(value: unknown, message: string) {
  if (value === undefined) return { ok: true as const, value: undefined };
  if (typeof value !== "boolean") return { ok: false as const, response: masterDataError(400, message) };
  return { ok: true as const, value };
}

export function parseMasterDataId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function withUniqueConflict(
  operation: () => Promise<NextResponse>,
  conflictMessage: string,
): Promise<NextResponse> {
  try {
    return await operation();
  } catch (error) {
    if (postgresErrorCode(error) === "23505") return masterDataError(409, conflictMessage);
    throw error;
  }
}

export async function deleteLookupRecord({
  table,
  id,
  referenceConflictMessage,
  databaseFailureMessage,
}: {
  table: LookupTable;
  id: number;
  referenceConflictMessage: string;
  databaseFailureMessage: string;
}): Promise<NextResponse> {
  try {
    // Employee lookup foreign keys use ON DELETE SET NULL in the schema.
    const [item] = await db.delete(table).where(eq(table.id, id)).returning();
    if (!item) return masterDataError(404, "Not found");
    return NextResponse.json({ item });
  } catch (error) {
    if (postgresErrorCode(error) === "23503") return masterDataError(409, referenceConflictMessage);
    return masterDataError(500, databaseFailureMessage);
  }
}
