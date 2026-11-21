import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/employment-types/route";
import { DELETE, PATCH } from "@/app/api/employment-types/[id]/route";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";
import { employees, employmentTypes } from "@/lib/db/schema";
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

describe("employment-types settings CRUD", () => {
  it("POST returns 403 for an employee, and 201 with code+name for a supervisor", async () => {
    const employeeToken = await tokenFor("employee");
    const forbidden = await POST(
      apiRequest("http://localhost/api/employment-types", { method: "POST", token: employeeToken, body: { code: "intern", name: "ฝึกงาน" } }),
    );
    expect(forbidden.status).toBe(403);

    const supervisorToken = await tokenFor("hr");
    const created = await POST(
      apiRequest("http://localhost/api/employment-types", { method: "POST", token: supervisorToken, body: { code: " intern ", name: " ฝึกงาน " } }),
    );
    const payload = await created.json();
    expect(created.status).toBe(201);
    expect(payload.item.code).toBe("intern");
    expect(payload.item.name).toBe("ฝึกงาน");

    const duplicateCode = await POST(
      apiRequest("http://localhost/api/employment-types", { method: "POST", token: supervisorToken, body: { code: "intern", name: "ฝึกงานพิเศษ" } }),
    );
    expect(duplicateCode.status).toBe(409);
  });

  it("rejects a missing code with 400", async () => {
    const token = await tokenFor("hr");
    const response = await POST(apiRequest("http://localhost/api/employment-types", { method: "POST", token, body: { name: "ไม่มีรหัส" } }));
    expect(response.status).toBe(400);
  });

  it("PATCH edits the name, then DELETE removes the type and clears employee references", async () => {
    const [type] = await db.insert(employmentTypes).values({ code: "part_time", name: "พาร์ทไทม์" }).returning();
    const employee = await createEmployee({ employmentTypeId: type.id });
    const token = await tokenFor("executive");

    const edited = await PATCH(
      apiRequest(`http://localhost/api/employment-types/${type.id}`, { method: "PATCH", token, body: { name: "พาร์ทไทม์ (แก้ไข)" } }),
      { params: Promise.resolve({ id: String(type.id) }) },
    );
    expect(edited.status).toBe(200);

    const deleted = await DELETE(
      apiRequest(`http://localhost/api/employment-types/${type.id}`, { method: "DELETE", token }),
      { params: Promise.resolve({ id: String(type.id) }) },
    );
    const deletedPayload = await deleted.json();
    expect(deleted.status).toBe(200);
    expect(deletedPayload.item.id).toBe(type.id);

    const [row] = await db.select().from(employmentTypes).where(eq(employmentTypes.id, type.id));
    const [updatedEmployee] = await db.select().from(employees).where(eq(employees.id, employee.id));
    expect(row).toBeUndefined();
    expect(updatedEmployee.employmentTypeId).toBeNull();
  });
});
