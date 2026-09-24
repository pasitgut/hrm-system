import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/assets/route";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createAsset, createUser } from "@/tests/setup/factories";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

async function cookieFor(payload: SessionPayload): Promise<string> {
  return createSessionToken(payload);
}

function apiRequest(url: string, options: { token?: string; method?: string; body?: unknown } = {}) {
  const { token, method = "GET", body } = options;
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `${COOKIE_NAME}=${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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

describe("GET /api/assets", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await GET(apiRequest("http://localhost/api/assets"));
    expect(response.status).toBe(401);
  });

  it("lists assets with category name joined, visible to an employee", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    await createAsset({ name: "MacBook Air" });
    void employee;

    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(apiRequest("http://localhost/api/assets", { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].name).toBe("MacBook Air");
    expect(payload.items[0].categoryName).toBe("คอมพิวเตอร์");
    expect(payload.items[0].status).toBe("available");
  });

  it("filters by status", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    await createAsset({ status: "available" });
    await createAsset({ status: "maintenance" });

    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(apiRequest("http://localhost/api/assets?status=maintenance", { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].status).toBe("maintenance");
  });

  it("rejects an invalid status filter", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(apiRequest("http://localhost/api/assets?status=bogus", { token }));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/assets", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await POST(apiRequest("http://localhost/api/assets", { method: "POST", body: { name: "x", categoryId: 1 } }));
    expect(response.status).toBe(401);
  });

  it("returns 403 for an employee", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await POST(apiRequest("http://localhost/api/assets", { method: "POST", token, body: { name: "x", categoryId: 1 } }));
    expect(response.status).toBe(403);
  });

  it("creates an asset as a supervisor, generating a code and defaulting status", async () => {
    const { user, employee } = await createUser({ role: "supervisor" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "supervisor" }));
    const response = await POST(
      apiRequest("http://localhost/api/assets", {
        method: "POST",
        token,
        body: { name: "จอมอนิเตอร์ Dell", categoryId: 1 },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.item.name).toBe("จอมอนิเตอร์ Dell");
    expect(payload.item.status).toBe("available");
    expect(payload.item.code).toMatch(/^AST-\d{3}$/);
  });

  it("rejects an unknown categoryId with 400", async () => {
    const { user, employee } = await createUser({ role: "ceo" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "ceo" }));
    const response = await POST(
      apiRequest("http://localhost/api/assets", { method: "POST", token, body: { name: "x", categoryId: 999999 } }),
    );
    expect(response.status).toBe(400);
  });
});
