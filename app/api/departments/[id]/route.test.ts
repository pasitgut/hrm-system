import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { DELETE, PATCH } from "@/app/api/departments/[id]/route";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";
import { departments, employees } from "@/lib/db/schema";
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

async function seedDepartment(name = "Marketing") {
  const [row] = await db.insert(departments).values({ name }).returning();
  return row;
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("PATCH /api/departments/[id]", () => {
  it("returns 403 for an employee", async () => {
    const department = await seedDepartment();
    const token = await tokenFor("employee");
    const response = await PATCH(
      apiRequest(`http://localhost/api/departments/${department.id}`, { method: "PATCH", token, body: { name: "New" } }),
      { params: Promise.resolve({ id: String(department.id) }) },
    );
    expect(response.status).toBe(403);
  });

  it("edits the name for a supervisor", async () => {
    const department = await seedDepartment();
    const token = await tokenFor("hr");
    const response = await PATCH(
      apiRequest(`http://localhost/api/departments/${department.id}`, { method: "PATCH", token, body: { name: "Marketing & Growth" } }),
      { params: Promise.resolve({ id: String(department.id) }) },
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.item.name).toBe("Marketing & Growth");
  });

  it("returns 404 for an id that does not exist", async () => {
    const token = await tokenFor("hr");
    const response = await PATCH(
      apiRequest("http://localhost/api/departments/999999", { method: "PATCH", token, body: { name: "X" } }),
      { params: Promise.resolve({ id: "999999" }) },
    );
    expect(response.status).toBe(404);
  });

  it("reactivates a deactivated department via isActive: true", async () => {
    const department = await seedDepartment();
    await db.update(departments).set({ isActive: false }).where(eq(departments.id, department.id));
    const token = await tokenFor("executive");
    const response = await PATCH(
      apiRequest(`http://localhost/api/departments/${department.id}`, { method: "PATCH", token, body: { isActive: true } }),
      { params: Promise.resolve({ id: String(department.id) }) },
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.item.isActive).toBe(true);
  });
});

describe("DELETE /api/departments/[id]", () => {
  it("returns 403 for an employee", async () => {
    const department = await seedDepartment();
    const token = await tokenFor("employee");
    const response = await DELETE(
      apiRequest(`http://localhost/api/departments/${department.id}`, { method: "DELETE", token }),
      { params: Promise.resolve({ id: String(department.id) }) },
    );
    expect(response.status).toBe(403);
  });

  it("deletes the department and clears employee department references", async () => {
    const department = await seedDepartment();
    const employee = await createEmployee({ departmentId: department.id });
    const token = await tokenFor("hr");
    const response = await DELETE(
      apiRequest(`http://localhost/api/departments/${department.id}`, { method: "DELETE", token }),
      { params: Promise.resolve({ id: String(department.id) }) },
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.item.id).toBe(department.id);

    const [row] = await db.select().from(departments).where(eq(departments.id, department.id));
    const [updatedEmployee] = await db.select().from(employees).where(eq(employees.id, employee.id));
    expect(row).toBeUndefined();
    expect(updatedEmployee.departmentId).toBeNull();
  });
});
