import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/employment-statuses/route";
import { DELETE, PATCH } from "@/app/api/employment-statuses/[id]/route";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";
import { employees, employmentStatuses } from "@/lib/db/schema";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";
import { createEmployee } from "@/tests/setup/factories";

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

    const supervisorToken = await tokenFor("hr");
    const created = await POST(apiRequest("http://localhost/api/employment-statuses", { method: "POST", token: supervisorToken, body: { name: "พักงาน" } }));
    const payload = await created.json();
    expect(created.status).toBe(201);
    expect(payload.item.name).toBe("พักงาน");
  });

  it("PATCH edits the name, then DELETE removes the status and clears employee references", async () => {
    const [status] = await db.insert(employmentStatuses).values({ name: "ทดลองงาน" }).returning();
    const employee = await createEmployee({ employmentStatusId: status.id });
    const token = await tokenFor("executive");

    const edited = await PATCH(
      apiRequest(`http://localhost/api/employment-statuses/${status.id}`, { method: "PATCH", token, body: { name: "ทดลองงาน (แก้ไข)" } }),
      { params: Promise.resolve({ id: String(status.id) }) },
    );
    expect(edited.status).toBe(200);

    const deleted = await DELETE(
      apiRequest(`http://localhost/api/employment-statuses/${status.id}`, { method: "DELETE", token }),
      { params: Promise.resolve({ id: String(status.id) }) },
    );
    const deletedPayload = await deleted.json();
    expect(deleted.status).toBe(200);
    expect(deletedPayload.item.id).toBe(status.id);

    const [row] = await db.select().from(employmentStatuses).where(eq(employmentStatuses.id, status.id));
    const [updatedEmployee] = await db.select().from(employees).where(eq(employees.id, employee.id));
    expect(row).toBeUndefined();
    expect(updatedEmployee.employmentStatusId).toBeNull();
  });
});
