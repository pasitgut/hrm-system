import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireAdminDataApiUser, withApiAuth } from "@/lib/auth/dal";
import { isAdminTableKey } from "@/lib/admin-data/registry";
import {
  AdminDataError,
  getDeleteImpact,
  hardDeleteAdminRow,
  updateAdminRow,
} from "@/lib/admin-data/service";

type RouteContext = { params: Promise<{ table: string; id: string }> };

export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireAdminDataApiUser(request);
  const { table, id } = await context.params;
  if (!isAdminTableKey(table)) return jsonError(404, "ไม่พบตารางข้อมูลที่ระบุ");

  try {
    return NextResponse.json(await getDeleteImpact(table, id));
  } catch (error) {
    if (error instanceof AdminDataError) return jsonError(error.status, error.message);
    throw error;
  }
});

export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const actor = await requireAdminDataApiUser(request);
  const { table, id } = await context.params;
  if (!isAdminTableKey(table)) return jsonError(404, "ไม่พบตารางข้อมูลที่ระบุ");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Invalid request body");
  }

  try {
    const item = await updateAdminRow(table, id, body as Record<string, unknown>, actor);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof AdminDataError) return jsonError(error.status, error.message);
    throw error;
  }
});

export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const actor = await requireAdminDataApiUser(request);
  const { table, id } = await context.params;
  if (!isAdminTableKey(table)) return jsonError(404, "ไม่พบตารางข้อมูลที่ระบุ");

  try {
    return NextResponse.json(await hardDeleteAdminRow(table, id, actor));
  } catch (error) {
    if (error instanceof AdminDataError) return jsonError(error.status, error.message);
    throw error;
  }
});
