import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { GET } from "@/app/api/user-permissions/route";
import { POST } from "@/app/api/user-permissions/provision/route";
import { SYSTEM_ADMIN_USER_ID } from "@/lib/auth/admin";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";
import { runDatabaseMigrations } from "@/lib/db/auto-migrate";
import { employees, users } from "@/lib/db/schema";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createEmployee, createUser } from "@/tests/setup/factories";

function req(url: string, options: { method?: string; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers.cookie = `${COOKIE_NAME}=${options.token}`;
  return new NextRequest(url, { method: options.method ?? "GET", headers });
}

function sessionFor(user: { id: string; employeeId: string; email: string; role: SessionPayload["role"] }): SessionPayload {
  return { sub: user.id, employeeId: user.employeeId, email: user.email, role: user.role };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/user-permissions & POST /api/user-permissions/provision", () => {
  it("rejects unauthenticated callers and employees without users.permissions.manage", async () => {
    expect((await POST(req("http://localhost/api/user-permissions/provision", { method: "POST" }))).status).toBe(401);

    const { user, employee } = await createUser({ role: "employee" });
    const empToken = await createSessionToken(
      sessionFor({ id: user.id, employeeId: employee!.id, email: user.email, role: "employee" }),
    );
    expect((await GET(req("http://localhost/api/user-permissions", { token: empToken }))).status).toBe(403);
    expect((await POST(req("http://localhost/api/user-permissions/provision", { method: "POST", token: empToken }))).status).toBe(403);
  });

  it("summarizes missing accounts and idempotently provisions eligible active employees", async () => {
    const adminToken = await createSessionToken({
      sub: SYSTEM_ADMIN_USER_ID,
      employeeId: "",
      email: "admin@peopleos.co",
      role: "hr",
      isSystemAdmin: true,
    });

    // Existing account whose users.email occupies conflict@example.com
    const { user: existingUser } = await createUser({
      role: "hr",
      email: "conflict@example.com",
    });
    expect(existingUser.isActive).toBe(true);

    // 1. Eligible active employee without user
    const eligibleEmp = await createEmployee({
      code: "2001",
      firstName: "อลิสา",
      lastName: "พร้อมใช้",
      email: "Alisa@Example.com",
    });
    // 2. Active employee without email
    const noEmailEmp = await createEmployee({
      code: "2002",
      firstName: "บดินทร์",
      lastName: "ไม่มีเมล",
      email: null,
    });
    // 3. Active employee with invalid email
    const badEmailEmp = await createEmployee({
      code: "2003",
      firstName: "จิดาภา",
      lastName: "เมลผิด",
      email: "not-an-email",
    });
    // 4. Active employee whose email collides with an existing user email
    const conflictEmp = await createEmployee({
      code: "2004",
      firstName: "ดนัย",
      lastName: "เมลซ้ำ",
      email: "conflict@example.com",
    });
    // 5. Offboarded employee (must never be provisioned or counted)
    await createEmployee({
      code: "2005",
      firstName: "เอกชัย",
      lastName: "พ้นสภาพ",
      email: "former@example.com",
      deletedAt: new Date(),
    });

    const getRes = await GET(req("http://localhost/api/user-permissions", { token: adminToken }));
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.items).toHaveLength(1);
    expect(getBody.missingAccounts).toMatchObject({
      eligibleCount: 1,
      missingEmailCount: 3,
      totalWithoutAccount: 4,
    });
    expect(getBody.missingAccounts.missingEmailEmployees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: noEmailEmp.id, code: "2002", reason: "missing_email" }),
        expect.objectContaining({ id: badEmailEmp.id, code: "2003", reason: "invalid_email" }),
        expect.objectContaining({ id: conflictEmp.id, code: "2004", reason: "email_in_use" }),
      ]),
    );

    const postRes = await POST(req("http://localhost/api/user-permissions/provision", { method: "POST", token: adminToken }));
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody).toMatchObject({
      createdCount: 1,
      skippedCount: 3,
    });

    const [createdUser] = await db.select().from(users).where(eq(users.employeeId, eligibleEmp.id));
    expect(createdUser).toMatchObject({
      employeeId: eligibleEmp.id,
      email: "alisa@example.com",
      role: "employee",
      isActive: true,
      mustChangePassword: true,
    });
    expect(await verifyPassword("2001", createdUser.passwordHash)).toBe(true);

    // Ensure former employee was never provisioned
    const [formerEmp] = await db.select().from(employees).where(eq(employees.code, "2005"));
    const [formerUser] = await db.select().from(users).where(eq(users.employeeId, formerEmp.id));
    expect(formerUser).toBeUndefined();

    // Idempotent second run creates 0 accounts
    const secondPostRes = await POST(req("http://localhost/api/user-permissions/provision", { method: "POST", token: adminToken }));
    expect(secondPostRes.status).toBe(200);
    expect((await secondPostRes.json()).createdCount).toBe(0);

    const afterGetRes = await GET(req("http://localhost/api/user-permissions", { token: adminToken }));
    const afterGetBody = await afterGetRes.json();
    expect(afterGetBody.items).toHaveLength(2);
    expect(afterGetBody.missingAccounts).toMatchObject({
      eligibleCount: 0,
      missingEmailCount: 3,
      totalWithoutAccount: 3,
    });
  });

  it("auto-provisions missing users for already-imported active employees during runDatabaseMigrations while preserving existing accounts", async () => {
    const customHash = await hashPassword("ExistingCustomPass!");
    const { user: existingUser, employee: existingEmp } = await createUser({
      role: "hr",
      email: "existing.hr@example.com",
      passwordHash: customHash,
      mustChangePassword: false,
    });
    const importedNoUser = await createEmployee({
      code: "3001",
      email: "Imported.Active@Example.com",
    });
    const importedNoEmail = await createEmployee({
      code: "3002",
      email: null,
    });
    const importedFormer = await createEmployee({
      code: "3003",
      email: "imported.former@example.com",
      deletedAt: new Date(),
    });

    await runDatabaseMigrations(process.env.DATABASE_URL);
    // Running twice must remain idempotent
    await runDatabaseMigrations(process.env.DATABASE_URL);

    const [provisionedUser] = await db.select().from(users).where(eq(users.employeeId, importedNoUser.id));
    expect(provisionedUser).toMatchObject({
      employeeId: importedNoUser.id,
      email: "imported.active@example.com",
      role: "employee",
      mustChangePassword: true,
      isActive: true,
    });
    expect(await verifyPassword("3001", provisionedUser.passwordHash)).toBe(true);

    // Existing account was untouched
    const [preserved] = await db.select().from(users).where(eq(users.id, existingUser.id));
    expect(preserved.employeeId).toBe(existingEmp!.id);
    expect(preserved.passwordHash).toBe(customHash);
    expect(preserved.role).toBe("hr");
    expect(preserved.mustChangePassword).toBe(false);

    // Missing email and former employees were not provisioned
    expect(await db.select().from(users).where(eq(users.employeeId, importedNoEmail.id))).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.employeeId, importedFormer.id))).toHaveLength(0);
  });
});
