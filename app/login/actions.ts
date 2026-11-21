"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { employees, users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie, clearSessionCookie } from "@/lib/auth/session";

export type LoginState = {
  error: string | null;
};

const GENERIC_ERROR = "ชื่อผู้ใช้/อีเมลหรือรหัสผ่านไม่ถูกต้อง";
const ADMIN_EMAIL = "admin@peopleos.co";

// Pure lookup + verify seam, deliberately separated from loginAction so it can
// be unit tested without a request-scoped `cookies()`/`redirect()` context.
// Returns the matching `users` row on success, or null for any failure reason
// (unknown username/email, inactive account, wrong password) — never reveals which.
export async function authenticate(identifier: string, password: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const normalizedEmail = normalizedIdentifier === "admin" ? ADMIN_EMAIL : normalizedIdentifier;
  if (!normalizedEmail || !password) return null;

  const [emailMatch] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  let user = emailMatch;
  if (!user) {
    const [codeMatch] = await db
      .select({ account: users })
      .from(users)
      .innerJoin(employees, eq(users.employeeId, employees.id))
      .where(eq(employees.code, identifier.trim()))
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
    const message = error instanceof Error ? error.message : "";
    console.error("Login authentication failed", message);
    if (message.includes("DATABASE_URL")) {
      return { error: "ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล (DATABASE_URL)" };
    }
    return { error: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" };
  }

  if (!user) {
    return { error: GENERIC_ERROR };
  }

  try {
    const token = await createSessionToken({
      sub: user.id,
      employeeId: user.employeeId,
      email: user.email,
      role: user.role,
      ...(user.mustChangePassword ? { mustChangePassword: true } : {}),
    });
    await setSessionCookie(token);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
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
