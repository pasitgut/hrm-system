import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH } from "@/app/api/leave/[id]/route";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createLeaveRequest, createUser } from "@/tests/setup/factories";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

function sessionFor(user: { id: string; employeeId: string; email: string; role: SessionPayload["role"] }): SessionPayload {
  return { sub: user.id, employeeId: user.employeeId, email: user.email, role: user.role };
}

function idRequest(id: string, method: string, token: string | undefined, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `${COOKIE_NAME}=${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost/api/leave/${id}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/leave/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { employee } = await createUser({ role: "employee" });
    const request = await createLeaveRequest({ employeeId: employee.id });
    const response = await GET(idRequest(request.id, "GET", undefined), context(request.id));
    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown id", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(idRequest("00000000-0000-0000-0000-000000000000", "GET", token), context("00000000-0000-0000-0000-000000000000"));
    expect(response.status).toBe(404);
  });

  it("returns 403 when an employee views another employee's request", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const { employee: other } = await createUser({ role: "employee" });
    const request = await createLeaveRequest({ employeeId: other.id });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await GET(idRequest(request.id, "GET", token), context(request.id));
    expect(response.status).toBe(403);
  });

  it("lets a supervisor view any employee's request", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "hr" });
    const { employee } = await createUser({ role: "employee" });
    const request = await createLeaveRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "hr" }));

    const response = await GET(idRequest(request.id, "GET", token), context(request.id));
    expect(response.status).toBe(200);
  });
});

describe("PATCH /api/leave/[id]", () => {
  it("lets the owner edit their own pending request", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const request = await createLeaveRequest({ employeeId: employee.id, startOn: "2026-10-01", endOn: "2026-10-01" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await PATCH(
      idRequest(request.id, "PATCH", token, { leaveTypeCode: "annual", startOn: "2026-11-01", endOn: "2026-11-02", session: "full", reason: "เที่ยว" }),
      context(request.id),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.leaveTypeCode).toBe("annual");
    expect(payload.item.startOn).toBe("2026-11-01");
    expect(payload.item.endOn).toBe("2026-11-02");
    expect(payload.item.reason).toBe("เที่ยว");
  });

  it("returns 403 when a different employee tries to edit", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const { employee: other } = await createUser({ role: "employee" });
    const request = await createLeaveRequest({ employeeId: other.id });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await PATCH(
      idRequest(request.id, "PATCH", token, { leaveTypeCode: "annual", startOn: "2026-11-01", endOn: "2026-11-01", session: "full", reason: "x" }),
      context(request.id),
    );
    expect(response.status).toBe(403);
  });

  it("returns 409 when editing a non-pending request", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const request = await createLeaveRequest({ employeeId: employee.id, statusCode: "approved" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await PATCH(
      idRequest(request.id, "PATCH", token, { leaveTypeCode: "annual", startOn: "2026-11-01", endOn: "2026-11-01", session: "full", reason: "x" }),
      context(request.id),
    );
    expect(response.status).toBe(409);
  });

  it("returns 400 for invalid input on edit", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const request = await createLeaveRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await PATCH(
      idRequest(request.id, "PATCH", token, { leaveTypeCode: "annual", startOn: "2026-11-05", endOn: "2026-11-01", session: "full", reason: "x" }),
      context(request.id),
    );
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/leave/[id]", () => {
  it("soft-cancels the owner's own pending request", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const request = await createLeaveRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await DELETE(idRequest(request.id, "DELETE", token), context(request.id));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.statusCode).toBe("cancelled");
    expect(payload.item.cancelledByEmployeeId).toBe(employee.id);
    expect(payload.item.cancelledAt).not.toBeNull();
  });

  it("returns 403 when a different employee tries to cancel", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const { employee: other } = await createUser({ role: "employee" });
    const request = await createLeaveRequest({ employeeId: other.id });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await DELETE(idRequest(request.id, "DELETE", token), context(request.id));
    expect(response.status).toBe(403);
  });

  it("returns 409 when cancelling a non-pending request", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const request = await createLeaveRequest({ employeeId: employee.id, statusCode: "approved" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await DELETE(idRequest(request.id, "DELETE", token), context(request.id));
    expect(response.status).toBe(409);
  });

  it("returns 404 for an unknown id", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await DELETE(idRequest("00000000-0000-0000-0000-000000000000", "DELETE", token), context("00000000-0000-0000-0000-000000000000"));
    expect(response.status).toBe(404);
  });
});
