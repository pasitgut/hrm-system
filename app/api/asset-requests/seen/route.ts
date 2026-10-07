import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { jsonError } from "@/app/api/asset-requests/_shared";
import { DrizzleAssetRepository } from "@/lib/assets/DrizzleAssetRepository";
import { db } from "@/lib/db/client";
import { employees } from "@/lib/db/schema";
import { canManageAssets } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null || !Array.isArray((body as { ids?: unknown }).ids)) {
    return jsonError(400, "Invalid request ids");
  }
  const ids = (body as { ids: unknown[] }).ids;
  if (ids.length > 200 || !ids.every((id) => typeof id === "string")) return jsonError(400, "Invalid request ids");
  const [employee] = await db.select({ code: employees.code }).from(employees).where(eq(employees.id, user.employeeId));
  if (!employee) return jsonError(404, "Employee not found");
  const repository = new DrizzleAssetRepository(user.employeeId);
  const visible = canManageAssets(user.permissions) ? await repository.listAll() : await repository.listForEmployee(employee.code);
  const visibleIds = new Set(visible.map((item) => item.id));
  if (!ids.every((id) => visibleIds.has(id as string))) return jsonError(403, "Forbidden");
  await repository.markSeen(ids as string[]);
  return NextResponse.json({ ok: true });
});
