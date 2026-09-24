import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/employment-statuses/route";
import { DELETE, PATCH } from "@/app/api/employment-statuses/[id]/route";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";
import { employmentStatuses } from "@/lib/db/schema";
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

describe("employment-statuses settings CRUD", () => {
  it("POST returns 403 for an employee and 201 for a supervisor", async () => {
    const employeeToken = await tokenFor("employee");
    const forbidden = await POST(apiRequest("http://localhost/api/employment-statuses", { method: "POST", token: employeeToken, body: { name: "พักงาน" } }));
    expect(forbidden.status).toBe(403);

    const supervisorToken = await tokenFor("supervisor");
    const created = await POST(apiRequest("http://localhost/api/employment-statuses", { method: "POST", token: supervisorToken, body: { name: "พักงาน" } }));
    const payload = await created.json();
    expect(created.status).toBe(201);
    expect(payload.item.name).toBe("พักงาน");
  });

  it("PATCH edits the name and DELETE soft-deactivates", async () => {
    const [status] = await db.insert(employmentStatuses).values({ name: "ทดลองงาน" }).returning();
    const token = await tokenFor("ceo");

    const edited = await PATCH(
      apiRequest(`http://localhost/api/employment-statuses/${status.id}`, { method: "PATCH", token, body: { name: "ทดลองงาน (แก้ไข)" } }),
      { params: Promise.resolve({ id: String(status.id) }) },
    );
    expect(edited.status).toBe(200);

    const deactivated = await DELETE(
      apiRequest(`http://localhost/api/employment-statuses/${status.id}`, { method: "DELETE", token }),
      { params: Promise.resolve({ id: String(status.id) }) },
    );
    const deactivatedPayload = await deactivated.json();
    expect(deactivated.status).toBe(200);
    expect(deactivatedPayload.item.isActive).toBe(false);

    const [row] = await db.select().from(employmentStatuses).where(eq(employmentStatuses.id, status.id));
    expect(row.isActive).toBe(false);
  });
});
