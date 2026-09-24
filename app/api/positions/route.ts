import { asc } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { positions } from "@/lib/db/schema";
import { requireApiRole, requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { readMasterDataBody, trimmedString, withUniqueConflict } from "@/lib/master-data/write-policy";

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

export const POST = withApiAuth(async (request: NextRequest) => {
  await requireApiRole(request, "supervisor", "ceo");
  const parsed = await readMasterDataBody(request);
  if (!parsed.ok) return parsed.response;
  const name = trimmedString(parsed.body.name, "name is required");
  if (!name.ok) return name.response;

  return withUniqueConflict(async () => {
    const [item] = await db.insert(positions).values({ name: name.value, isActive: true }).returning();
    return NextResponse.json({ item }, { status: 201 });
  }, "A position with this name already exists");
});
