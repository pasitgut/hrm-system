import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireAdminDataApiUser, withApiAuth } from "@/lib/auth/dal";
import { isAdminTableKey } from "@/lib/admin-data/registry";
import { AdminDataError, createAdminRow, listAdminRows } from "@/lib/admin-data/service";

type RouteContext = { params: Promise<{ table: string }> };

export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireAdminDataApiUser(request);
  const { table } = await context.params;
  if (!isAdminTableKey(table)) return jsonError(404, "ไม่พบตารางข้อมูลที่ระบุ");

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") ?? "";
  const page = Number(searchParams.get("page") ?? 1);
  const pageSize = Number(searchParams.get("pageSize") ?? 50);

  try {
    const result = await listAdminRows(table, {
      search,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdminDataError) return jsonError(error.status, error.message);
    throw error;
  }
});

export const POST = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireAdminDataApiUser(request);
  const { table } = await context.params;
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
    const item = await createAdminRow(table, body as Record<string, unknown>);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof AdminDataError) return jsonError(error.status, error.message);
    throw error;
  }
});
