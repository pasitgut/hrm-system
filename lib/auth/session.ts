import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

export type Role = "employee" | "supervisor" | "ceo";

export type SessionPayload = {
  sub: string; // users.id
  employeeId: string;
  email: string;
  role: Role;
  permissions?: string[];
  mustChangePassword?: boolean;
};

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "hrm_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 hours

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.employeeId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      employeeId: payload.employeeId as string,
      email: payload.email as string,
      role: payload.role as Role,
      ...(payload.mustChangePassword === true ? { mustChangePassword: true } : {}),
    };
  } catch {
    return null;
  }
}

// Only legal inside a Server Action or Route Handler (never during Server
// Component rendering — HTTP disallows Set-Cookie after streaming starts).
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function readSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

// For Route Handlers: reads the cookie straight off the incoming request
// instead of next/headers' ambient cookies(), which requires Next's own
// request-scoped AsyncLocalStorage context. NextRequest.cookies parses the
// request's own Cookie header directly, so this works identically whether
// the handler is invoked by the real Next.js server or called directly in a
// test with a hand-built NextRequest.
export function readSessionCookieFromRequest(request: NextRequest): string | undefined {
  return request.cookies.get(COOKIE_NAME)?.value;
}

export { COOKIE_NAME };
