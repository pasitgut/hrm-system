import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/ot/route";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createEmployee, createOvertimeRequest, createUser } from "@/tests/setup/factories";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

async function cookieFor(payload: SessionPayload): Promise<string> {
  return createSessionToken(payload);
}

function otRequest(url: string, options: { token?: string; method?: string; body?: unknown } = {}) {
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

describe("GET /api/ot", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await GET(otRequest("http://localhost/api/ot"));
    expect(response.status).toBe(401);
  });

  it("scopes an employee's requests to themselves", async () => {
    const { user: employeeUser, employee } = await createUser({ role: "employee" });
    const { employee: otherEmployee } = await createUser({ role: "employee" });
    await createOvertimeRequest({ employeeId: employee.id, startAt: new Date("2026-09-10T11:00:00Z"), endAt: new Date("2026-09-10T13:00:00Z") });
    await createOvertimeRequest({ employeeId: otherEmployee.id, startAt: new Date("2026-09-11T11:00:00Z"), endAt: new Date("2026-09-11T13:00:00Z") });

    const token = await cookieFor(sessionFor({ id: employeeUser.id, employeeId: employee.id, email: employeeUser.email, role: "employee" }));
    const response = await GET(otRequest("http://localhost/api/ot?month=2026-09", { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].employeeId).toBe(employee.id);
  });

  it("derives overtimeType per request from the date worked and the employee's weekly holidays", async () => {
    const employee = await createEmployee({ weeklyHolidays: [4] }); // Thursday
    const { user } = await createUser({ role: "employee", employeeId: employee.id });
    await createOvertimeRequest({ employeeId: employee.id, startAt: new Date("2026-09-10T11:00:00Z"), endAt: new Date("2026-09-10T13:00:00Z") }); // Thu 18:00 BKK
    await createOvertimeRequest({ employeeId: employee.id, startAt: new Date("2026-09-11T11:00:00Z"), endAt: new Date("2026-09-11T13:00:00Z") }); // Fri 18:00 BKK

    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const payload = await (await GET(otRequest("http://localhost/api/ot?month=2026-09", { token }))).json();

    expect(Object.fromEntries(payload.items.map((item: { date: string; overtimeType: string }) => [item.date, item.overtimeType])))
      .toEqual({ "2026-09-10": "holiday", "2026-09-11": "weekday" });
  });

  it("returns 403 when an employee requests another employee's id", async () => {
    const { user: employeeUser, employee } = await createUser({ role: "employee" });
    const { employee: otherEmployee } = await createUser({ role: "employee" });

    const token = await cookieFor(sessionFor({ id: employeeUser.id, employeeId: employee.id, email: employeeUser.email, role: "employee" }));
    const response = await GET(otRequest(`http://localhost/api/ot?employeeId=${otherEmployee.id}`, { token }));
    expect(response.status).toBe(403);
  });

  it("lets a supervisor see all employees' requests for the month", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "supervisor" });
    const { employee: employeeA } = await createUser({ role: "employee" });
    const { employee: employeeB } = await createUser({ role: "employee" });
    await createOvertimeRequest({ employeeId: employeeA.id, startAt: new Date("2026-09-10T11:00:00Z"), endAt: new Date("2026-09-10T13:00:00Z") });
    await createOvertimeRequest({ employeeId: employeeB.id, startAt: new Date("2026-09-11T11:00:00Z"), endAt: new Date("2026-09-11T13:00:00Z") });

    const token = await cookieFor(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "supervisor" }));
    const response = await GET(otRequest("http://localhost/api/ot?month=2026-09", { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(2);
  });

  it("lets a supervisor scope to a single employee via employeeId", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "supervisor" });
    const { employee: employeeA } = await createUser({ role: "employee" });
    const { employee: employeeB } = await createUser({ role: "employee" });
    await createOvertimeRequest({ employeeId: employeeA.id, startAt: new Date("2026-09-10T11:00:00Z"), endAt: new Date("2026-09-10T13:00:00Z") });
    await createOvertimeRequest({ employeeId: employeeB.id, startAt: new Date("2026-09-11T11:00:00Z"), endAt: new Date("2026-09-11T13:00:00Z") });

    const token = await cookieFor(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "supervisor" }));
    const response = await GET(otRequest(`http://localhost/api/ot?month=2026-09&employeeId=${employeeA.id}`, { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].employeeId).toBe(employeeA.id);
  });

  it("rejects an invalid status filter", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(otRequest("http://localhost/api/ot?status=bogus", { token }));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/ot", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await POST(otRequest("http://localhost/api/ot", { method: "POST", body: { date: "2026-09-10", startTime: "18:00", endTime: "20:00", reason: "test" } }));
    expect(response.status).toBe(401);
  });

  it("creates a pending request with correctly-computed Bangkok-offset timestamps", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      otRequest("http://localhost/api/ot", {
        method: "POST",
        token,
        body: { date: "2026-09-10", startTime: "18:00", endTime: "20:30", reason: "  ปิดงาน release  " },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.item.statusCode).toBe("pending");
    expect(payload.item.employeeId).toBe(employee.id);
    expect(payload.item.date).toBe("2026-09-10");
    expect(payload.item.startTime).toBe("18:00");
    expect(payload.item.endTime).toBe("20:30");
    expect(payload.item.durationHours).toBe(2.5);
    expect(payload.item.reason).toBe("ปิดงาน release");
  });

  it("rejects endTime <= startTime with 400", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      otRequest("http://localhost/api/ot", {
        method: "POST",
        token,
        body: { date: "2026-09-10", startTime: "20:00", endTime: "18:00", reason: "test" },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a body with a different employeeId", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const { employee: otherEmployee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      otRequest("http://localhost/api/ot", {
        method: "POST",
        token,
        body: { date: "2026-09-10", startTime: "18:00", endTime: "20:00", reason: "test", employeeId: otherEmployee.id },
      }),
    );
    expect(response.status).toBe(400);
  });
});
