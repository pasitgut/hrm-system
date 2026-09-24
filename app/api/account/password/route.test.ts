import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/account/password/route";
import { authenticate } from "@/app/login/actions";
import { COOKIE_NAME, createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";

function passwordRequest(token: string, body: unknown) {
  return new NextRequest("http://localhost/api/account/password", {
    method: "POST",
    headers: {
      cookie: `${COOKIE_NAME}=${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(resetDb);
afterAll(closeDb);

describe("POST /api/account/password", () => {
  it("replaces the temporary password and unlocks email and employee-code login", async () => {
    const { user, employee } = await createUser({
      email: "change.first@example.com",
      plainPassword: "2604",
      mustChangePassword: true,
    });
    const token = await createSessionToken({
      sub: user.id,
      employeeId: employee!.id,
      email: user.email,
      role: user.role,
      mustChangePassword: true,
    });

    const response = await POST(passwordRequest(token, { newPassword: "SafeNewPass123!" }));

    expect(response.status).toBe(200);
    const cookieHeader = response.headers.get("set-cookie") || "";
    const refreshedToken = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1];
    const refreshedSession = await verifySessionToken(decodeURIComponent(refreshedToken || ""));
    expect(refreshedSession?.sub).toBe(user.id);
    expect(refreshedSession).not.toHaveProperty("mustChangePassword");
    await expect(authenticate(user.email, "2604")).resolves.toBeNull();
    await expect(authenticate(user.email, "SafeNewPass123!")).resolves.toMatchObject({
      mustChangePassword: false,
    });
    await expect(authenticate(employee!.code, "SafeNewPass123!")).resolves.toMatchObject({
      id: user.id,
      mustChangePassword: false,
    });
  });
});
