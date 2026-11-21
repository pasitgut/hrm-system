"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { employees, users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import {
  getAdminConfig,
  isSystemAdminIdentifier,
  isSystemAdminSession,
  SYSTEM_ADMIN_USER_ID,
  verifySystemAdminCredentials,
} from "@/lib/auth/admin";
import { createSessionToken, setSessionCookie, clearSessionCookie } from "@/lib/auth/session";
import { classifyDatabaseError } from "@/lib/db/auto-migrate";

export type LoginState = {
  error: string | null;
};

const GENERIC_ERROR = "ชื่อผู้ใช้/อีเมลหรือรหัสผ่านไม่ถูกต้อง";

// Pure lookup + verify seam, deliberately separated from loginAction so it can
// be unit tested without a request-scoped `cookies()`/`redirect()` context.
// Returns the built-in system admin or matching `users` row on success, or null
// for any failure reason — never reveals which field failed.
export async function authenticate(identifier: string, password: string) {
  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier || !password) return null;

  if (isSystemAdminIdentifier(trimmedIdentifier)) {
    if (!verifySystemAdminCredentials(trimmedIdentifier, password)) {
      return null;
    }
    return {
      id: SYSTEM_ADMIN_USER_ID,
      employeeId: "",
      email: getAdminConfig().email,
      role: "hr" as const,
      mustChangePassword: false,
      isSystemAdmin: true as const,
    };
  }

  const normalizedEmail = trimmedIdentifier.toLowerCase();
  const [emailMatch] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  let user = emailMatch;
  if (!user) {
    const [codeMatch] = await db
      .select({ account: users })
      .from(users)
      .innerJoin(employees, eq(users.employeeId, employees.id))
      .where(eq(employees.code, trimmedIdentifier))
      .limit(1);
    user = codeMatch?.account;
  }
  if (!user || !user.isActive) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  return user;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextParam = String(formData.get("next") ?? "");

  let user: Awaited<ReturnType<typeof authenticate>>;
  try {
    user = await authenticate(identifier, password);
  } catch (error) {
    const status = classifyDatabaseError(error, process.env.DATABASE_URL);
    console.error("Login authentication failed:", status.reason, error instanceof Error ? error.message : "");
    return {
      error: status.hint ? `${status.message} — ${status.hint}` : (status.message ?? "ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง"),
    };
  }

  if (!user) {
    return { error: GENERIC_ERROR };
  }

  const isSystemAdmin = isSystemAdminSession({ sub: user.id, isSystemAdmin: "isSystemAdmin" in user && user.isSystemAdmin === true });

  try {
    const token = await createSessionToken({
      sub: user.id,
      employeeId: user.employeeId,
      email: user.email,
      role: user.role,
      ...(user.mustChangePassword ? { mustChangePassword: true } : {}),
      ...(isSystemAdmin ? { isSystemAdmin: true } : {}),
    });
    await setSessionCookie(token);
    if (!isSystemAdmin) {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("Login session setup failed", message);
    if (message.includes("JWT_SECRET")) {
      return { error: "ระบบยังไม่ได้ตั้งค่าความปลอดภัยของเซสชัน (JWT_SECRET)" };
    }
    return { error: "ไม่สามารถสร้างเซสชันเข้าสู่ระบบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" };
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  const destination = nextParam.startsWith("/") ? nextParam : "/";
  redirect(destination);
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
