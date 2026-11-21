import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/employees/route";
import { closeDb, resetDb, db } from "@/tests/setup/db";
import { createEmployee, createUser } from "@/tests/setup/factories";
import { employees } from "@/lib/db/schema";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";
import { authenticate } from "@/app/login/actions";

async function cookieFor(payload: SessionPayload): Promise<string> {
  return createSessionToken(payload);
}

function employeesRequest(url: string, options: { token?: string; method?: string; body?: unknown } = {}) {
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

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/employees", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await GET(employeesRequest("http://localhost/api/employees"));
    expect(response.status).toBe(401);
  });

  it("excludes soft-deleted employees by default", async () => {
    const { token } = await tokenFor("employee");
    const active = await createEmployee({ firstName: "คงอยู่" });
    const offboarded = await createEmployee({ firstName: "พ้นสภาพ" });
    await db.update(employees).set({ deletedAt: new Date() }).where(eq(employees.id, offboarded.id));

    const response = await GET(employeesRequest("http://localhost/api/employees", { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    const ids = payload.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(offboarded.id);
  });

  it("returns 403 when an employee requests includeDeleted=true", async () => {
    const { token } = await tokenFor("employee");
    const response = await GET(employeesRequest("http://localhost/api/employees?includeDeleted=true", { token }));
    expect(response.status).toBe(403);
  });

  it("lets a supervisor see soft-deleted employees via includeDeleted=true", async () => {
    const { token } = await tokenFor("hr");
    const offboarded = await createEmployee({ firstName: "พ้นสภาพ" });
    await db.update(employees).set({ deletedAt: new Date() }).where(eq(employees.id, offboarded.id));

    const response = await GET(employeesRequest("http://localhost/api/employees?includeDeleted=true", { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    const item = payload.items.find((row: { id: string }) => row.id === offboarded.id);
    expect(item).toBeDefined();
    expect(item.isActive).toBe(false);
  });

  it("returns the documented flattened/nested item shape", async () => {
    const { token } = await tokenFor("employee");
    const employee = await createEmployee({ firstName: "ทดสอบ", lastName: "ดีโท" });

    const response = await GET(employeesRequest("http://localhost/api/employees", { token }));
    const payload = await response.json();
    const item = payload.items.find((row: { id: string }) => row.id === employee.id);

    expect(item).toMatchObject({
      id: employee.id,
      firstName: "ทดสอบ",
      lastName: "ดีโท",
      department: { id: expect.any(Number), name: expect.any(String) },
      position: { id: expect.any(Number), name: expect.any(String) },
      employmentStatus: { id: expect.any(Number), name: expect.any(String) },
      employmentType: { id: expect.any(Number), code: expect.any(String), name: expect.any(String) },
      managerId: null,
      managerName: null,
      isActive: true,
    });
  });
});

describe("POST /api/employees", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await POST(employeesRequest("http://localhost/api/employees", { method: "POST", body: {} }));
    expect(response.status).toBe(401);
  });

  it("returns 403 when an employee tries to create", async () => {
    const { token } = await tokenFor("employee");
    const response = await POST(
      employeesRequest("http://localhost/api/employees", {
        method: "POST",
        token,
        body: { firstName: "ก", lastName: "ข", startDate: "2026-01-01", departmentId: 1, positionId: 1, employmentStatusId: 1, employmentTypeId: 1 },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("creates a login using the employee code as the initial password", async () => {
    const { token } = await tokenFor("hr");
    const response = await POST(
      employeesRequest("http://localhost/api/employees", {
        method: "POST",
        token,
        body: {
          code: "2604",
          firstName: "สมชาย",
          lastName: "ใจดี",
          startDate: "2026-01-01",
          departmentId: 1,
          positionId: 1,
          employmentStatusId: 1,
          employmentTypeId: 1,
          email: "somchai@example.com",
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.item.code).toBe("2604");
    expect(payload.item.firstName).toBe("สมชาย");
    expect(payload.item.email).toBe("somchai@example.com");
    expect(payload.item.isActive).toBe(true);

    const account = await authenticate("somchai@example.com", "2604");
    expect(account).toMatchObject({
      email: "somchai@example.com",
      role: "employee",
      mustChangePassword: true,
    });
    await expect(authenticate("2604", "2604")).resolves.toMatchObject({ id: account?.id });
  });

  it("rejects a missing required field with 400", async () => {
    const { token } = await tokenFor("hr");
    const response = await POST(
      employeesRequest("http://localhost/api/employees", {
        method: "POST",
        token,
        body: { lastName: "ใจดี", startDate: "2026-01-01", departmentId: 1, positionId: 1, employmentStatusId: 1, employmentTypeId: 1 },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a departmentId that does not exist", async () => {
    const { token } = await tokenFor("hr");
    const response = await POST(
      employeesRequest("http://localhost/api/employees", {
        method: "POST",
        token,
        body: { firstName: "ก", lastName: "ข", startDate: "2026-01-01", departmentId: 9999, positionId: 1, employmentStatusId: 1, employmentTypeId: 1 },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 409 on a duplicate email instead of a raw DB error", async () => {
    const { token } = await tokenFor("hr");
    await createEmployee({ email: "dup@example.com" });

    const response = await POST(
      employeesRequest("http://localhost/api/employees", {
        method: "POST",
        token,
        body: { code: "2605", firstName: "ก", lastName: "ข", startDate: "2026-01-01", departmentId: 1, positionId: 1, employmentStatusId: 1, employmentTypeId: 1, email: "dup@example.com" },
      }),
    );
    expect(response.status).toBe(409);
  });
});
