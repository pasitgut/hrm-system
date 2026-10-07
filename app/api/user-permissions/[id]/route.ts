import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { PERMISSIONS, hasPermission, type PermissionKey } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string }> };
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const permissionKeys = new Set<string>(PERMISSIONS.map(({ key }) => key));

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  await requireApiPermission(request, "users.permissions.manage");
  const { id } = await context.params;
  if (!USER_ID_PATTERN.test(id)) return jsonError(400, "Invalid user id");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(400, "Invalid request body");

  const value = (body as Record<string, unknown>).permissions;
  if (!Array.isArray(value) || value.some((permission) => typeof permission !== "string" || !permissionKeys.has(permission))) {
    return jsonError(400, "permissions contains an unknown permission");
  }
  const permissions = [...new Set(value)] as PermissionKey[];

  const result = await db.transaction(async (tx) => {
    // Serialize permission-manager changes so two concurrent requests cannot
    // both remove the final account that can recover access to this screen.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(74821931)`);
    const activeAccounts = await tx
      .select({ id: users.id, permissions: users.permissions })
      .from(users)
      .where(eq(users.isActive, true));
    const target = activeAccounts.find((account) => account.id === id);
    if (!target) return { kind: "not-found" as const };

    const removesLastManager = hasPermission(target.permissions, "users.permissions.manage")
      && !permissions.includes("users.permissions.manage")
      && !activeAccounts.some((account) => account.id !== id && hasPermission(account.permissions, "users.permissions.manage"));
    if (removesLastManager) return { kind: "last-manager" as const };

    const [updated] = await tx
      .update(users)
      .set({ permissions, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id, permissions: users.permissions });
    return updated ? { kind: "updated" as const, item: updated } : { kind: "not-found" as const };
  });

  if (result.kind === "not-found") return jsonError(404, "User account not found");
  if (result.kind === "last-manager") return jsonError(409, "At least one active user must keep permission management access");
  return NextResponse.json({ item: result.item });
});
