import { asc } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employmentTypes } from "@/lib/db/schema";
import { requireApiPermission, requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { readMasterDataBody, trimmedString, withUniqueConflict } from "@/lib/master-data/write-policy";

// Read-only lookup endpoint: any authenticated account may list employment
// types (needed for dropdowns across the app). Write access lives in the
// settings module, added separately to this same file.

export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiUser(request);
  const items = await db.select().from(employmentTypes).orderBy(asc(employmentTypes.name));
  return NextResponse.json({ items });
});

// --- Settings module: create (settings.manage). Edit/delete live in
// ./[id]/route.ts. DELETE removes the lookup row and clears employee refs. ---

export const POST = withApiAuth(async (request: NextRequest) => {
  await requireApiPermission(request, "settings.manage");
  const parsed = await readMasterDataBody(request);
  if (!parsed.ok) return parsed.response;
  const code = trimmedString(parsed.body.code, "code is required");
  if (!code.ok) return code.response;
  const name = trimmedString(parsed.body.name, "name is required");
  if (!name.ok) return name.response;

  return withUniqueConflict(async () => {
    const [item] = await db
      .insert(employmentTypes)
      .values({ code: code.value, name: name.value, isActive: true })
      .returning();
    return NextResponse.json({ item }, { status: 201 });
  }, "An employment type with this code or name already exists");
});
