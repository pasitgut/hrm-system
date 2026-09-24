import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ApiAuthError, requireApiRole, requireApiUser } from "@/lib/auth/dal";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

const payload: SessionPayload = {
  sub: "11111111-1111-1111-1111-111111111111",
  employeeId: "22222222-2222-2222-2222-222222222222",
  email: "test@example.com",
  role: "employee",
};

function requestWithCookie(token?: string) {
  return new NextRequest("http://localhost/api/ot", {
    headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : undefined,
  });
}

describe("requireApiUser / requireApiRole (Route Handler guards)", () => {
  it("resolves the session from a plain NextRequest's Cookie header, with no Next.js server needed", async () => {
    const token = await createSessionToken(payload);
    const user = await requireApiUser(requestWithCookie(token));
    expect(user).toEqual(payload);
  });

  it("throws a 401 ApiAuthError when there is no cookie", async () => {
    await expect(requireApiUser(requestWithCookie())).rejects.toMatchObject({ status: 401 });
  });

  it("throws a 401 ApiAuthError when the cookie is invalid", async () => {
    await expect(requireApiUser(requestWithCookie("garbage"))).rejects.toBeInstanceOf(ApiAuthError);
  });

  it("blocks API access while a first-login password change is required", async () => {
    const token = await createSessionToken({ ...payload, mustChangePassword: true } as SessionPayload);

    await expect(requireApiUser(requestWithCookie(token))).rejects.toMatchObject({ status: 403 });
  });

  it("allows a role that is in the allowed list", async () => {
    const token = await createSessionToken({ ...payload, role: "supervisor" });
    const user = await requireApiRole(requestWithCookie(token), "supervisor", "ceo");
    expect(user.role).toBe("supervisor");
  });

  it("throws a 403 ApiAuthError for a role that is not allowed", async () => {
    const token = await createSessionToken({ ...payload, role: "employee" });
    await expect(requireApiRole(requestWithCookie(token), "supervisor", "ceo")).rejects.toMatchObject({ status: 403 });
  });
});
