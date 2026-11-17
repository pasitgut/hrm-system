import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/leave-types/route";
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

async function tokenFor(role: SessionPayload["role"]) {
  const { user, employee } = await createUser({ role });
  return createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role }));
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/leave-types", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await GET(apiRequest("http://localhost/api/leave-types"));
    expect(response.status).toBe(401);
  });

  it("lists the seeded leave types (code as identifier, quota included)", async () => {
    const token = await tokenFor("employee");
    const response = await GET(apiRequest("http://localhost/api/leave-types", { token }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.items.some((item: { code: string }) => item.code === "sick")).toBe(true);
  });
});

describe("POST /api/leave-types", () => {
  it("returns 403 for an employee", async () => {
    const token = await tokenFor("employee");
    const response = await POST(
      apiRequest("http://localhost/api/leave-types", { method: "POST", token, body: { code: "unpaid", name: "ลาไม่รับค่าจ้าง" } }),
    );
    expect(response.status).toBe(403);
  });

  it("creates an active leave type with a database-assigned code and a quota for a supervisor", async () => {
    const token = await tokenFor("supervisor");
    const response = await POST(
      apiRequest("http://localhost/api/leave-types", {
        method: "POST",
        token,
        body: { name: "ลาคลอด", annualQuotaDays: 90, description: "ลาคลอดบุตร" },
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.item.code).toMatch(/^\d+$/);
    expect(payload.item.annualQuotaDays).toBe(90);
    expect(payload.item.isActive).toBe(true);
  });

  it("allows a null annualQuotaDays to mean uncapped", async () => {
    const token = await tokenFor("ceo");
    const response = await POST(
      apiRequest("http://localhost/api/leave-types", { method: "POST", token, body: { code: "unpaid", name: "ลาไม่รับค่าจ้าง" } }),
    );
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.item.annualQuotaDays).toBeNull();
  });

  it("rejects a negative annualQuotaDays with 400", async () => {
    const token = await tokenFor("supervisor");
    const response = await POST(
      apiRequest("http://localhost/api/leave-types", { method: "POST", token, body: { code: "bogus", name: "bogus", annualQuotaDays: -5 } }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a missing name with 400", async () => {
    const token = await tokenFor("supervisor");
    const response = await POST(
      apiRequest("http://localhost/api/leave-types", { method: "POST", token, body: { annualQuotaDays: 3 } }),
    );
    expect(response.status).toBe(400);
  });

  it("returns a clean 409 on a duplicate name", async () => {
    const token = await tokenFor("supervisor");
    const response = await POST(
      apiRequest("http://localhost/api/leave-types", { method: "POST", token, body: { name: "ลาป่วย" } }),
    );
    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(typeof payload.error).toBe("string");
  });
});
