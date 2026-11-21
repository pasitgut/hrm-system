import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH } from "@/app/api/ot/[id]/route";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createOvertimeRequest, createUser } from "@/tests/setup/factories";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

function sessionFor(user: { id: string; employeeId: string; email: string; role: SessionPayload["role"] }): SessionPayload {
  return { sub: user.id, employeeId: user.employeeId, email: user.email, role: user.role };
}

function otItemRequest(id: string, method: string, token: string | undefined, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `${COOKIE_NAME}=${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const request = new NextRequest(`http://localhost/api/ot/${id}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { request, context: { params: Promise.resolve({ id }) } };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("PATCH /api/ot/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { employee } = await createUser({ role: "employee" });
    const otRequest = await createOvertimeRequest({ employeeId: employee.id });
    const { request, context } = otItemRequest(otRequest.id, "PATCH", undefined, {
      date: "2026-09-12",
      startTime: "18:00",
      endTime: "20:00",
      reason: "แก้ไขคำขอ",
    });
    const response = await PATCH(request, context);
    expect(response.status).toBe(401);
  });

  it("lets the owning employee edit their own pending request", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const otRequest = await createOvertimeRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const { request, context } = otItemRequest(otRequest.id, "PATCH", token, {
      date: "2026-09-12",
      startTime: "18:00",
      endTime: "21:00",
      reason: "  แก้ไขคำขอ  ",
    });
    const response = await PATCH(request, context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.date).toBe("2026-09-12");
    expect(payload.item.startTime).toBe("18:00");
    expect(payload.item.endTime).toBe("21:00");
    expect(payload.item.durationHours).toBe(3);
    expect(payload.item.reason).toBe("แก้ไขคำขอ");
    expect(payload.item.statusCode).toBe("pending");
  });

  it("returns 403 when another employee tries to edit", async () => {
    const { employee: owner } = await createUser({ role: "employee" });
    const { user: otherUser, employee: other } = await createUser({ role: "employee" });
    const otRequest = await createOvertimeRequest({ employeeId: owner.id });
    const token = await createSessionToken(sessionFor({ id: otherUser.id, employeeId: other.id, email: otherUser.email, role: "employee" }));

    const { request, context } = otItemRequest(otRequest.id, "PATCH", token, {
      date: "2026-09-12",
      startTime: "18:00",
      endTime: "20:00",
      reason: "test",
    });
    const response = await PATCH(request, context);
    expect(response.status).toBe(403);
  });

  it("returns 403 when a supervisor tries to edit someone else's request", async () => {
    const { employee } = await createUser({ role: "employee" });
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "hr" });
    const otRequest = await createOvertimeRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "hr" }));

    const { request, context } = otItemRequest(otRequest.id, "PATCH", token, {
      date: "2026-09-12",
      startTime: "18:00",
      endTime: "20:00",
      reason: "test",
    });
    const response = await PATCH(request, context);
    expect(response.status).toBe(403);
  });

  it("returns 409 when the request is no longer pending", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const otRequest = await createOvertimeRequest({ employeeId: employee.id, statusCode: "approved" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const { request, context } = otItemRequest(otRequest.id, "PATCH", token, {
      date: "2026-09-12",
      startTime: "18:00",
      endTime: "20:00",
      reason: "test",
    });
    const response = await PATCH(request, context);
    expect(response.status).toBe(409);
  });

  it("returns 400 for endTime <= startTime", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const otRequest = await createOvertimeRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const { request, context } = otItemRequest(otRequest.id, "PATCH", token, {
      date: "2026-09-12",
      startTime: "20:00",
      endTime: "18:00",
      reason: "test",
    });
    const response = await PATCH(request, context);
    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown request id", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const { request, context } = otItemRequest("00000000-0000-0000-0000-000000000000", "PATCH", token, {
      date: "2026-09-12",
      startTime: "18:00",
      endTime: "20:00",
      reason: "test",
    });
    const response = await PATCH(request, context);
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/ot/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const { employee } = await createUser({ role: "employee" });
    const otRequest = await createOvertimeRequest({ employeeId: employee.id });
    const { request, context } = otItemRequest(otRequest.id, "DELETE", undefined);
    const response = await DELETE(request, context);
    expect(response.status).toBe(401);
  });

  it("lets the owning employee cancel their own pending request", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const otRequest = await createOvertimeRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const { request, context } = otItemRequest(otRequest.id, "DELETE", token);
    const response = await DELETE(request, context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.statusCode).toBe("cancelled");

    const { request: getRequest, context: getContext } = otItemRequest(otRequest.id, "GET", token);
    const getResponse = await GET(getRequest, getContext);
    const getPayload = await getResponse.json();
    expect(getPayload.item.statusCode).toBe("cancelled");
  });

  it("returns 403 when another employee tries to cancel", async () => {
    const { employee: owner } = await createUser({ role: "employee" });
    const { user: otherUser, employee: other } = await createUser({ role: "employee" });
    const otRequest = await createOvertimeRequest({ employeeId: owner.id });
    const token = await createSessionToken(sessionFor({ id: otherUser.id, employeeId: other.id, email: otherUser.email, role: "employee" }));

    const { request, context } = otItemRequest(otRequest.id, "DELETE", token);
    const response = await DELETE(request, context);
    expect(response.status).toBe(403);
  });

  it("returns 403 when a supervisor tries to cancel someone else's request", async () => {
    const { employee } = await createUser({ role: "employee" });
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "hr" });
    const otRequest = await createOvertimeRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "hr" }));

    const { request, context } = otItemRequest(otRequest.id, "DELETE", token);
    const response = await DELETE(request, context);
    expect(response.status).toBe(403);
  });

  it("returns 409 when the request is no longer pending", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const otRequest = await createOvertimeRequest({ employeeId: employee.id, statusCode: "rejected" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const { request, context } = otItemRequest(otRequest.id, "DELETE", token);
    const response = await DELETE(request, context);
    expect(response.status).toBe(409);
  });

  it("returns 404 for an unknown request id", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const { request, context } = otItemRequest("00000000-0000-0000-0000-000000000000", "DELETE", token);
    const response = await DELETE(request, context);
    expect(response.status).toBe(404);
  });
});
