import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH } from "@/app/api/employees/[id]/route";
import { closeDb, resetDb, db } from "@/tests/setup/db";
import { createEmployee, createUser } from "@/tests/setup/factories";
import { employees, users } from "@/lib/db/schema";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";
import { authenticate } from "@/app/login/actions";

async function cookieFor(payload: SessionPayload): Promise<string> {
  return createSessionToken(payload);
}

function employeeRequest(url: string, options: { token?: string; method?: string; body?: unknown } = {}) {
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

async function tokenFor(role: SessionPayload["role"]) {
  const { user, employee } = await createUser({ role });
  const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role }));
  return { token, user, employee };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/employees/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const employee = await createEmployee();
    const response = await GET(employeeRequest(`http://localhost/api/employees/${employee.id}`), ctx(employee.id));
    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown id", async () => {
    const { token } = await tokenFor("employee");
    const response = await GET(employeeRequest("http://localhost/api/employees/00000000-0000-0000-0000-000000000000", { token }), ctx("00000000-0000-0000-0000-000000000000"));
    expect(response.status).toBe(404);
  });

  it("still returns a soft-deleted employee by id", async () => {
    const { token } = await tokenFor("employee");
    const employee = await createEmployee();
    await db.update(employees).set({ deletedAt: new Date() }).where(eq(employees.id, employee.id));

    const response = await GET(employeeRequest(`http://localhost/api/employees/${employee.id}`, { token }), ctx(employee.id));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.isActive).toBe(false);
  });
});

describe("PATCH /api/employees/[id]", () => {
  it("returns 403 when an employee tries to update", async () => {
    const { token } = await tokenFor("employee");
    const employee = await createEmployee();
    const response = await PATCH(
      employeeRequest(`http://localhost/api/employees/${employee.id}`, { method: "PATCH", token, body: { nickname: "ใหม่" } }),
      ctx(employee.id),
    );
    expect(response.status).toBe(403);
  });

  it("lets a supervisor partially update writable fields", async () => {
    const { token } = await tokenFor("supervisor");
    const employee = await createEmployee({ nickname: "เก่า" });

    const response = await PATCH(
      employeeRequest(`http://localhost/api/employees/${employee.id}`, { method: "PATCH", token, body: { nickname: "ใหม่" } }),
      ctx(employee.id),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.nickname).toBe("ใหม่");
    expect(payload.item.firstName).toBe(employee.firstName);
  });

  it("updates the linked login email with the employee email", async () => {
    const { token } = await tokenFor("supervisor");
    const employee = await createEmployee({ email: "old.employee@example.com" });
    const { user } = await createUser({
      employeeId: employee.id,
      email: "old.employee@example.com",
      plainPassword: "Password123!",
    });

    const response = await PATCH(
      employeeRequest(`http://localhost/api/employees/${employee.id}`, {
        method: "PATCH",
        token,
        body: { email: "New.Employee@example.com" },
      }),
      ctx(employee.id),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.email).toBe("new.employee@example.com");
    await expect(authenticate("old.employee@example.com", "Password123!")).resolves.toBeNull();
    await expect(authenticate("new.employee@example.com", "Password123!")).resolves.toMatchObject({
      id: user.id,
      employeeId: employee.id,
    });
  });

  it("returns 400 for a managerId equal to the employee's own id", async () => {
    const { token } = await tokenFor("supervisor");
    const employee = await createEmployee();

    const response = await PATCH(
      employeeRequest(`http://localhost/api/employees/${employee.id}`, { method: "PATCH", token, body: { managerId: employee.id } }),
      ctx(employee.id),
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown id", async () => {
    const { token } = await tokenFor("supervisor");
    const response = await PATCH(
      employeeRequest("http://localhost/api/employees/00000000-0000-0000-0000-000000000000", { method: "PATCH", token, body: { nickname: "x" } }),
      ctx("00000000-0000-0000-0000-000000000000"),
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 before parsing malformed JSON for an unknown id", async () => {
    const { token } = await tokenFor("supervisor");
    const id = "00000000-0000-0000-0000-000000000000";
    const request = new NextRequest(`http://localhost/api/employees/${id}`, {
      method: "PATCH",
      headers: {
        cookie: `${COOKIE_NAME}=${token}`,
        "content-type": "application/json",
      },
      body: "{",
    });

    const response = await PATCH(request, ctx(id));

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/employees/[id]", () => {
  it("returns 403 when an employee tries to delete", async () => {
    const { token } = await tokenFor("employee");
    const employee = await createEmployee();
    const response = await DELETE(employeeRequest(`http://localhost/api/employees/${employee.id}`, { method: "DELETE", token }), ctx(employee.id));
    expect(response.status).toBe(403);
  });

  it("soft-deletes the employee and cascades to users.isActive = false", async () => {
    const { token } = await tokenFor("supervisor");
    const { user, employee } = await createUser({ role: "employee" });

    const response = await DELETE(employeeRequest(`http://localhost/api/employees/${employee.id}`, { method: "DELETE", token }), ctx(employee.id));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.isActive).toBe(false);

    const [dbEmployee] = await db.select().from(employees).where(eq(employees.id, employee.id));
    expect(dbEmployee.deletedAt).not.toBeNull();

    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id));
    expect(dbUser.isActive).toBe(false);
  });

  it("returns 409 when the employee is already off-boarded", async () => {
    const { token } = await tokenFor("supervisor");
    const employee = await createEmployee();
    await db.update(employees).set({ deletedAt: new Date() }).where(eq(employees.id, employee.id));

    const response = await DELETE(employeeRequest(`http://localhost/api/employees/${employee.id}`, { method: "DELETE", token }), ctx(employee.id));
    expect(response.status).toBe(409);
  });

  it("returns 404 for an unknown id", async () => {
    const { token } = await tokenFor("supervisor");
    const response = await DELETE(
      employeeRequest("http://localhost/api/employees/00000000-0000-0000-0000-000000000000", { method: "DELETE", token }),
      ctx("00000000-0000-0000-0000-000000000000"),
    );
    expect(response.status).toBe(404);
  });
});
