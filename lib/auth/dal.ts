import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getSystemAdminPermissions, isSystemAdminUserId } from "@/lib/auth/admin";
import { hasAnyPermission, hasPermission, type PermissionKey } from "@/lib/auth/permissions";
import { normalizeRole, type Role } from "@/lib/auth/roles";
import {
  readSessionCookie,
  readSessionCookieFromRequest,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth/session";

export const getCurrentUser = cache(async (): Promise<SessionPayload | null> => {
  const token = await readSessionCookie();
  if (!token) return null;
  return verifySessionToken(token);
});

// Role and permissions are always read from the database, never trusted from the
// JWT, so role changes, revoking a grant, or deactivating an account take effect
// on the next request. Returns null when the account is missing or inactive.
async function findActiveAccount(userId: string): Promise<{ role: Role; permissions: string[] } | null> {
  if (isSystemAdminUserId(userId)) {
    return {
      role: "hr",
      permissions: getSystemAdminPermissions(),
    };
  }
  const [account] = await db
    .select({ role: users.role, permissions: users.permissions, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account?.isActive) return null;
  return {
    role: normalizeRole(account.role),
    permissions: Array.isArray(account.permissions) ? account.permissions : [],
  };
}

// --- Server Components / Server Actions: redirect on failure ---

export async function requireUser(): Promise<SessionPayload> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  const account = await findActiveAccount(user.sub);
  if (!account) redirect("/login");
  return { ...user, role: account.role, permissions: account.permissions };
}

export async function getUserAccess(userId: string): Promise<{ role: Role; permissions: string[] } | null> {
  return findActiveAccount(userId);
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  return (await findActiveAccount(userId))?.permissions ?? [];
}

export async function requirePermission(permission: PermissionKey): Promise<SessionPayload> {
  const user = await requireUser();
  if (!hasPermission(user.permissions, permission)) redirect("/");
  return user;
}

export async function requireAnyPermission(...permissions: PermissionKey[]): Promise<SessionPayload> {
  const user = await requireUser();
  if (!hasAnyPermission(user.permissions, ...permissions)) redirect("/");
  return user;
}

// --- Route Handlers: throw a typed error, never redirect ---

export class ApiAuthError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireApiUser(request: NextRequest): Promise<SessionPayload> {
  const token = readSessionCookieFromRequest(request);
  const user = token ? await verifySessionToken(token) : null;
  if (!user) throw new ApiAuthError(401, "Unauthorized");
  if (user.mustChangePassword) throw new ApiAuthError(403, "Password change required");
  const account = await findActiveAccount(user.sub);
  if (!account) throw new ApiAuthError(401, "Account is inactive");
  return { ...user, role: account.role, permissions: account.permissions };
}

export async function requireApiPermission(request: NextRequest, permission: PermissionKey): Promise<SessionPayload> {
  const user = await requireApiUser(request);
  if (!hasPermission(user.permissions, permission)) throw new ApiAuthError(403, "Forbidden");
  return user;
}

export async function requireApiAnyPermission(request: NextRequest, ...permissions: PermissionKey[]): Promise<SessionPayload> {
  const user = await requireApiUser(request);
  if (!hasAnyPermission(user.permissions, ...permissions)) throw new ApiAuthError(403, "Forbidden");
  return user;
}

// Wraps a Route Handler body so every handler gets consistent 401/403 JSON
// responses without repeating a try/catch around requireApiUser/requireApiRole.
export function withApiAuth<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  };
}
