import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { COOKIE_NAME, createSessionToken, readSessionCookieFromRequest, verifySessionToken } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

const EIGHT_HOURS_SECONDS = 60 * 60 * 8;

export async function POST(request: NextRequest) {
  const sessionToken = readSessionCookieFromRequest(request);
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;
  if (!session) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่ก่อนเปลี่ยนรหัสผ่าน" }, { status: 401 });
  if (!session.mustChangePassword) {
    return NextResponse.json({ error: "บัญชีนี้ไม่จำเป็นต้องเปลี่ยนรหัสผ่านเริ่มต้น" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง กรุณาลองใหม่" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || !("newPassword" in body)) {
    return NextResponse.json({ error: "กรุณากรอกรหัสผ่านใหม่" }, { status: 400 });
  }
  const newPassword = (body as Record<string, unknown>).newPassword;
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" }, { status: 400 });
  }

  const [account] = await db.select().from(users).where(eq(users.id, session.sub)).limit(1);
  if (!account || !account.isActive) {
    return NextResponse.json({ error: "ไม่พบบัญชีผู้ใช้ที่กำลังเข้าสู่ระบบ" }, { status: 401 });
  }
  if (!account.mustChangePassword) {
    return NextResponse.json({ error: "รหัสผ่านเริ่มต้นถูกเปลี่ยนไปแล้ว กรุณาเข้าสู่ระบบใหม่" }, { status: 409 });
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, account.id));

  const nextToken = await createSessionToken({
    sub: account.id,
    employeeId: account.employeeId,
    email: account.email,
    role: account.role,
  });
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, nextToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: EIGHT_HOURS_SECONDS,
  });
  return response;
}
