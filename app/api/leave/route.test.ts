import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/leave/route";
import { closeDb, resetDb, db } from "@/tests/setup/db";
import { createLeaveRequest, createUser } from "@/tests/setup/factories";
import { leaveTypes } from "@/lib/db/schema";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

function sessionFor(user: { id: string; employeeId: string; email: string; role: SessionPayload["role"] }): SessionPayload {
  return { sub: user.id, employeeId: user.employeeId, email: user.email, role: user.role };
}

function leaveRequestHttp(url: string, options: { token?: string; method?: string; body?: unknown } = {}) {
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

async function cookieFor(payload: SessionPayload): Promise<string> {
  return createSessionToken(payload);
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/leave", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await GET(leaveRequestHttp("http://localhost/api/leave"));
    expect(response.status).toBe(401);
  });

  it("scopes an employee's requests to themselves", async () => {
    const { user: employeeUser, employee } = await createUser({ role: "employee" });
    const { employee: otherEmployee } = await createUser({ role: "employee" });
    await createLeaveRequest({ employeeId: employee.id });
    await createLeaveRequest({ employeeId: otherEmployee.id });

    const token = await cookieFor(sessionFor({ id: employeeUser.id, employeeId: employee.id, email: employeeUser.email, role: "employee" }));
    const response = await GET(leaveRequestHttp("http://localhost/api/leave", { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].employeeId).toBe(employee.id);
  });

  it("returns 403 when an employee requests another employee's id", async () => {
    const { user: employeeUser, employee } = await createUser({ role: "employee" });
    const { employee: otherEmployee } = await createUser({ role: "employee" });

    const token = await cookieFor(sessionFor({ id: employeeUser.id, employeeId: employee.id, email: employeeUser.email, role: "employee" }));
    const response = await GET(leaveRequestHttp(`http://localhost/api/leave?employeeId=${otherEmployee.id}`, { token }));
    expect(response.status).toBe(403);
  });

  it("lets a supervisor see all employees' requests", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "supervisor" });
    const { employee: employeeA } = await createUser({ role: "employee" });
    const { employee: employeeB } = await createUser({ role: "employee" });
    await createLeaveRequest({ employeeId: employeeA.id });
    await createLeaveRequest({ employeeId: employeeB.id });

    const token = await cookieFor(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "supervisor" }));
    const response = await GET(leaveRequestHttp("http://localhost/api/leave", { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(2);
  });

  it("lets a supervisor scope to a single employee via employeeId", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "supervisor" });
    const { employee: employeeA } = await createUser({ role: "employee" });
    const { employee: employeeB } = await createUser({ role: "employee" });
    await createLeaveRequest({ employeeId: employeeA.id });
    await createLeaveRequest({ employeeId: employeeB.id });

    const token = await cookieFor(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "supervisor" }));
    const response = await GET(leaveRequestHttp(`http://localhost/api/leave?employeeId=${employeeA.id}`, { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].employeeId).toBe(employeeA.id);
  });

  it("filters by status", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    await createLeaveRequest({ employeeId: employee.id, statusCode: "pending" });
    await createLeaveRequest({ employeeId: employee.id, statusCode: "approved" });

    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(leaveRequestHttp("http://localhost/api/leave?status=approved", { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].statusCode).toBe("approved");
  });

  it("rejects an invalid status filter", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(leaveRequestHttp("http://localhost/api/leave?status=bogus", { token }));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/leave", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await POST(
      leaveRequestHttp("http://localhost/api/leave", { method: "POST", body: { leaveTypeCode: "sick", startOn: "2026-10-05", endOn: "2026-10-05", session: "full", reason: "test" } }),
    );
    expect(response.status).toBe(401);
  });

  it("creates a pending request for the caller's own employee", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      leaveRequestHttp("http://localhost/api/leave", {
        method: "POST",
        token,
        body: { leaveTypeCode: "sick", startOn: "2026-10-05", endOn: "2026-10-07", session: "full", reason: "  ไม่สบาย  " },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.item.statusCode).toBe("pending");
    expect(payload.item.employeeId).toBe(employee.id);
    expect(payload.item.leaveTypeCode).toBe("sick");
    expect(payload.item.startOn).toBe("2026-10-05");
    expect(payload.item.endOn).toBe("2026-10-07");
    expect(payload.item.days).toBe(3);
    expect(payload.item.reason).toBe("ไม่สบาย");
  });

  it("rejects startOn after endOn with 400", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      leaveRequestHttp("http://localhost/api/leave", {
        method: "POST",
        token,
        body: { leaveTypeCode: "sick", startOn: "2026-10-07", endOn: "2026-10-05", session: "full", reason: "test" },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a half-day session on a multi-day request with 400", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      leaveRequestHttp("http://localhost/api/leave", {
        method: "POST",
        token,
        body: { leaveTypeCode: "sick", startOn: "2026-10-05", endOn: "2026-10-06", session: "am", reason: "test" },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("accepts a half-day session on a single-day request", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      leaveRequestHttp("http://localhost/api/leave", {
        method: "POST",
        token,
        body: { leaveTypeCode: "sick", startOn: "2026-10-05", endOn: "2026-10-05", session: "pm", reason: "test" },
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.item.days).toBe(0.5);
  });

  it("rejects an unknown leave type with 400", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      leaveRequestHttp("http://localhost/api/leave", {
        method: "POST",
        token,
        body: { leaveTypeCode: "not-a-real-type", startOn: "2026-10-05", endOn: "2026-10-05", session: "full", reason: "test" },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects an inactive leave type with 400", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    await db.update(leaveTypes).set({ isActive: false }).where(eq(leaveTypes.code, "sick"));

    const response = await POST(
      leaveRequestHttp("http://localhost/api/leave", {
        method: "POST",
        token,
        body: { leaveTypeCode: "sick", startOn: "2026-10-05", endOn: "2026-10-05", session: "full", reason: "test" },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a body with a different employeeId", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const { employee: otherEmployee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      leaveRequestHttp("http://localhost/api/leave", {
        method: "POST",
        token,
        body: { leaveTypeCode: "sick", startOn: "2026-10-05", endOn: "2026-10-05", session: "full", reason: "test", employeeId: otherEmployee.id },
      }),
    );
    expect(response.status).toBe(400);
  });
});
