import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import {
  readSessionCookie,
  readSessionCookieFromRequest,
  verifySessionToken,
  type Role,
  type SessionPayload,
} from "@/lib/auth/session";

export const getCurrentUser = cache(async (): Promise<SessionPayload | null> => {
  const token = await readSessionCookie();
  if (!token) return null;
  return verifySessionToken(token);
});

// --- Server Components / Server Actions: redirect on failure ---

export async function requireUser(): Promise<SessionPayload> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionPayload> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
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
  return user;
}

export async function requireApiRole(request: NextRequest, ...roles: Role[]): Promise<SessionPayload> {
  const user = await requireApiUser(request);
  if (!roles.includes(user.role)) throw new ApiAuthError(403, "Forbidden");
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
