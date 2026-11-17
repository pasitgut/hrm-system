import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { ApiAuthError, requireApiAnyPermission, requireApiPermission, requireApiUser } from "@/lib/auth/dal";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";
import { users } from "@/lib/db/schema";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";

function requestWithCookie(token?: string) {
  return new NextRequest("http://localhost/api/ot", {
    headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : undefined,
  });
}

async function tokenFor(
  account: { id: string; employeeId: string; email: string; role: SessionPayload["role"] },
  extra: Partial<SessionPayload> = {},
) {
  return createSessionToken({ sub: account.id, employeeId: account.employeeId, email: account.email, role: account.role, ...extra });
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("requireApiUser (Route Handler guard)", () => {
  it("resolves the session from a plain NextRequest's Cookie header and loads permissions from the database", async () => {
    const { user } = await createUser({ permissions: ["ot.approve"] });

    const result = await requireApiUser(requestWithCookie(await tokenFor(user)));

    expect(result).toMatchObject({ sub: user.id, employeeId: user.employeeId, permissions: ["ot.approve"] });
  });

  it("ignores permissions carried in the token and trusts the database", async () => {
    const { user } = await createUser({ permissions: [] });

    const result = await requireApiUser(requestWithCookie(await tokenFor(user, { permissions: ["users.permissions.manage"] })));

    expect(result.permissions).toEqual([]);
  });

  it("throws a 401 ApiAuthError when there is no cookie", async () => {
    await expect(requireApiUser(requestWithCookie())).rejects.toMatchObject({ status: 401 });
  });

  it("throws a 401 ApiAuthError when the cookie is invalid", async () => {
    await expect(requireApiUser(requestWithCookie("garbage"))).rejects.toBeInstanceOf(ApiAuthError);
  });

  it("throws a 401 when the account was deactivated after the token was issued", async () => {
    const { user } = await createUser();
    await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

    await expect(requireApiUser(requestWithCookie(await tokenFor(user)))).rejects.toMatchObject({ status: 401 });
  });

  it("blocks API access while a first-login password change is required", async () => {
    const { user } = await createUser();
    const token = await tokenFor(user, { mustChangePassword: true });

    await expect(requireApiUser(requestWithCookie(token))).rejects.toMatchObject({ status: 403 });
  });
});

describe("requireApiPermission / requireApiAnyPermission", () => {
  it("allows an account holding the permission", async () => {
    const { user } = await createUser({ permissions: ["leave.approve"] });

    const result = await requireApiPermission(requestWithCookie(await tokenFor(user)), "leave.approve");

    expect(result.sub).toBe(user.id);
  });

  it("throws a 403 ApiAuthError when the permission is missing", async () => {
    const { user } = await createUser({ permissions: [] });

    await expect(requireApiPermission(requestWithCookie(await tokenFor(user)), "leave.approve")).rejects.toMatchObject({ status: 403 });
  });

  it("allows any one of several permissions and rejects when none match", async () => {
    const { user } = await createUser({ permissions: ["ot.view_company"] });
    const request = requestWithCookie(await tokenFor(user));

    await expect(requireApiAnyPermission(request, "ot.approve", "ot.view_company")).resolves.toMatchObject({ sub: user.id });
    await expect(requireApiAnyPermission(request, "ot.approve", "leave.approve")).rejects.toMatchObject({ status: 403 });
  });
});
