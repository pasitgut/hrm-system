import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/departments/route";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

function sessionFor(user: { id: string; employeeId: string; email: string; role: SessionPayload["role"] }): SessionPayload {
  return { sub: user.id, employeeId: user.employeeId, email: user.email, role: user.role };
}

function apiRequest(url: string, options: { token?: string; method?: string; body?: unknown } = {}) {
  const { token, method = "GET", body } = options;
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `${COOKIE_NAME}=${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/departments", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await GET(apiRequest("http://localhost/api/departments"));
    expect(response.status).toBe(401);
  });

  it("lists seeded departments for any authenticated role", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(apiRequest("http://localhost/api/departments", { token }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.items.length).toBeGreaterThan(0);
  });
});

describe("POST /api/departments", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await POST(apiRequest("http://localhost/api/departments", { method: "POST", body: { name: "Legal" } }));
    expect(response.status).toBe(401);
  });

  it("returns 403 for an employee", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await POST(apiRequest("http://localhost/api/departments", { method: "POST", token, body: { name: "Legal" } }));
    expect(response.status).toBe(403);
  });

  it("returns 201 and creates an active department for a supervisor", async () => {
    const { user, employee } = await createUser({ role: "supervisor" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "supervisor" }));
    const response = await POST(apiRequest("http://localhost/api/departments", { method: "POST", token, body: { name: "Legal" } }));
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.item.name).toBe("Legal");
    expect(payload.item.isActive).toBe(true);
  });

  it("returns 201 for a ceo", async () => {
    const { user, employee } = await createUser({ role: "ceo" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "ceo" }));
    const response = await POST(apiRequest("http://localhost/api/departments", { method: "POST", token, body: { name: "Finance" } }));
    expect(response.status).toBe(201);
  });

  it("rejects an empty name with 400", async () => {
    const { user, employee } = await createUser({ role: "supervisor" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "supervisor" }));
    const response = await POST(apiRequest("http://localhost/api/departments", { method: "POST", token, body: { name: "   " } }));
    expect(response.status).toBe(400);
  });

  it("returns a clean 409 (not a raw DB error) on a duplicate name", async () => {
    const { user, employee } = await createUser({ role: "supervisor" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "supervisor" }));
    await POST(apiRequest("http://localhost/api/departments", { method: "POST", token, body: { name: "Legal" } }));
    const response = await POST(apiRequest("http://localhost/api/departments", { method: "POST", token, body: { name: "Legal" } }));
    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(typeof payload.error).toBe("string");
  });
});
