import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employmentStatuses } from "@/lib/db/schema";
import { requireApiRole, withApiAuth } from "@/lib/auth/dal";
import {
  deleteLookupRecord,
  masterDataError,
  optionalBoolean,
  optionalTrimmedString,
  parseMasterDataId,
  readMasterDataBody,
  withUniqueConflict,
} from "@/lib/master-data/write-policy";

// Edit or permanently remove an employment status. Employee rows keep their
// history with a null status after the corresponding lookup row is removed.

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiRole(request, "supervisor", "ceo");
  const { id: rawId } = await context.params;
  const id = parseMasterDataId(rawId);
  if (id === null) return masterDataError(400, "Invalid id");

  const parsed = await readMasterDataBody(request);
  if (!parsed.ok) return parsed.response;
  const name = optionalTrimmedString(parsed.body.name, "name must be a non-empty string");
  if (!name.ok) return name.response;
  const isActive = optionalBoolean(parsed.body.isActive, "isActive must be a boolean");
  if (!isActive.ok) return isActive.response;

  const patch: Partial<typeof employmentStatuses.$inferInsert> = {};
  if (name.value !== undefined) patch.name = name.value;
  if (isActive.value !== undefined) patch.isActive = isActive.value;
  if (Object.keys(patch).length === 0) return masterDataError(400, "No fields to update");

  return withUniqueConflict(async () => {
    const [item] = await db.update(employmentStatuses).set(patch).where(eq(employmentStatuses.id, id)).returning();
    if (!item) return masterDataError(404, "Not found");
    return NextResponse.json({ item });
  }, "An employment status with this name already exists");
});

export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiRole(request, "supervisor", "ceo");
  const { id: rawId } = await context.params;
  const id = parseMasterDataId(rawId);
  if (id === null) return masterDataError(400, "Invalid id");

  return deleteLookupRecord({
    table: employmentStatuses,
    id,
    referenceConflictMessage: "ยังมีข้อมูลอ้างอิงสถานะพนักงานนี้อยู่ จึงลบไม่ได้",
    databaseFailureMessage: "ลบสถานะพนักงานไม่สำเร็จ เนื่องจากฐานข้อมูลขัดข้อง กรุณาลองใหม่",
  });
});
