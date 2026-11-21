import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

const payload: SessionPayload = {
  sub: "11111111-1111-1111-1111-111111111111",
  employeeId: "22222222-2222-2222-2222-222222222222",
  email: "test@example.com",
  role: "employee",
};

function requestFor(path: string, token?: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : undefined,
  });
}

describe("proxy", () => {
  it("allows only the exact signed webhook and service-auth retry endpoints through session redirects", async () => {
    expect((await proxy(requestFor("/api/line/webhook"))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(requestFor("/api/internal/integrations/retry"))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(requestFor("/api/line/webhook/other"))).status).toBe(307);
    expect((await proxy(requestFor("/api/leave"))).status).toBe(307);
  });
  it("redirects to /login when there is no session cookie on a protected path", async () => {
    const response = await proxy(requestFor("/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2F");
  });

  it("redirects to /login when the session cookie is invalid on a protected path", async () => {
    const response = await proxy(requestFor("/approvals", "not-a-valid-session"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fapprovals");
  });

  it("allows visitors with an invalid session cookie to reach /login", async () => {
    const response = await proxy(requestFor("/login", "not-a-valid-session"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects authenticated visitors away from /login", async () => {
    const token = await createSessionToken(payload);

    const response = await proxy(requestFor("/login", token));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("passes through unauthenticated requests to /login itself", async () => {
    const response = await proxy(requestFor("/login"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("passes through authenticated requests to a protected path", async () => {
    const token = await createSessionToken(payload);

    const response = await proxy(requestFor("/approvals", token));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects first-login sessions to password change instead of protected pages", async () => {
    const token = await createSessionToken({ ...payload, mustChangePassword: true } as SessionPayload);

    const response = await proxy(requestFor("/employees", token));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/change-password");
  });

  it("allows first-login sessions to reach the password change page", async () => {
    const token = await createSessionToken({ ...payload, mustChangePassword: true } as SessionPayload);

    const response = await proxy(requestFor("/change-password", token));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
