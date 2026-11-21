import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { DELETE, PATCH } from "@/app/api/leave-types/[code]/route";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";
import { leaveTypes } from "@/lib/db/schema";
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

describe("PATCH /api/leave-types/[code]", () => {
  it("returns 403 for an employee", async () => {
    const token = await tokenFor("employee");
    const response = await PATCH(
      apiRequest("http://localhost/api/leave-types/sick", { method: "PATCH", token, body: { annualQuotaDays: 5 } }),
      { params: Promise.resolve({ code: "sick" }) },
    );
    expect(response.status).toBe(403);
  });

  it("edits the quota and description for a supervisor, code (PK) unaffected", async () => {
    const token = await tokenFor("hr");
    const response = await PATCH(
      apiRequest("http://localhost/api/leave-types/sick", {
        method: "PATCH",
        token,
        body: { annualQuotaDays: 45, description: "ลาป่วยตามกฎหมาย" },
      }),
      { params: Promise.resolve({ code: "sick" }) },
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.item.code).toBe("sick");
    expect(payload.item.annualQuotaDays).toBe(45);
    expect(payload.item.description).toBe("ลาป่วยตามกฎหมาย");
  });

  it("clears the quota back to uncapped when annualQuotaDays is set to null", async () => {
    const token = await tokenFor("executive");
    const response = await PATCH(
      apiRequest("http://localhost/api/leave-types/annual", { method: "PATCH", token, body: { annualQuotaDays: null } }),
      { params: Promise.resolve({ code: "annual" }) },
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.item.annualQuotaDays).toBeNull();
  });

  it("returns 404 for a code that does not exist", async () => {
    const token = await tokenFor("hr");
    const response = await PATCH(
      apiRequest("http://localhost/api/leave-types/nonexistent", { method: "PATCH", token, body: { name: "x" } }),
      { params: Promise.resolve({ code: "nonexistent" }) },
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/leave-types/[code]", () => {
  it("returns 403 for an employee", async () => {
    const token = await tokenFor("employee");
    const response = await DELETE(apiRequest("http://localhost/api/leave-types/sick", { method: "DELETE", token }), {
      params: Promise.resolve({ code: "sick" }),
    });
    expect(response.status).toBe(403);
  });

  it("soft-deactivates (isActive: false) instead of removing the row", async () => {
    const token = await tokenFor("hr");
    const response = await DELETE(apiRequest("http://localhost/api/leave-types/sick", { method: "DELETE", token }), {
      params: Promise.resolve({ code: "sick" }),
    });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.item.isActive).toBe(false);

    const [row] = await db.select().from(leaveTypes).where(eq(leaveTypes.code, "sick"));
    expect(row).toBeDefined();
    expect(row.isActive).toBe(false);
  });

  it("can be reactivated afterwards via PATCH isActive: true", async () => {
    const token = await tokenFor("hr");
    await DELETE(apiRequest("http://localhost/api/leave-types/sick", { method: "DELETE", token }), {
      params: Promise.resolve({ code: "sick" }),
    });
    const response = await PATCH(
      apiRequest("http://localhost/api/leave-types/sick", { method: "PATCH", token, body: { isActive: true } }),
      { params: Promise.resolve({ code: "sick" }) },
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.item.isActive).toBe(true);
  });
});
