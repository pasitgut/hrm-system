import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/ot/[id]/decision/route";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createOvertimeRequest, createUser } from "@/tests/setup/factories";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

function sessionFor(user: { id: string; employeeId: string; email: string; role: SessionPayload["role"] }): SessionPayload {
  return { sub: user.id, employeeId: user.employeeId, email: user.email, role: user.role };
}

function decisionRequest(id: string, token: string | undefined, body: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.cookie = `${COOKIE_NAME}=${token}`;
  const request = new NextRequest(`http://localhost/api/ot/${id}/decision`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("PATCH /api/ot/[id]/decision", () => {
  it("returns 403 for an employee role", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const request = await createOvertimeRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await decisionRequest(request.id, token, { decision: "approved" });
    expect(response.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const { employee } = await createUser({ role: "employee" });
    const request = await createOvertimeRequest({ employeeId: employee.id });

    const response = await decisionRequest(request.id, undefined, { decision: "approved" });
    expect(response.status).toBe(401);
  });

  it("lets a supervisor approve a pending request and sets decision fields", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "supervisor" });
    const { employee } = await createUser({ role: "employee" });
    const request = await createOvertimeRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "supervisor" }));

    const response = await decisionRequest(request.id, token, { decision: "approved", note: "ok ทำงานได้" });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.statusCode).toBe("approved");
    expect(payload.item.decidedByEmployeeId).toBe(supervisor.id);
    expect(payload.item.decisionNote).toBe("ok ทำงานได้");
    expect(payload.item.decidedAt).not.toBeNull();
  });

  it("lets a ceo reject a pending request", async () => {
    const { user: ceoUser, employee: ceo } = await createUser({ role: "ceo" });
    const { employee } = await createUser({ role: "employee" });
    const request = await createOvertimeRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: ceoUser.id, employeeId: ceo.id, email: ceoUser.email, role: "ceo" }));

    const response = await decisionRequest(request.id, token, { decision: "rejected" });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.statusCode).toBe("rejected");
    expect(payload.item.decidedByEmployeeId).toBe(ceo.id);
  });

  it("returns 404 for an unknown request id", async () => {
    const { user, employee } = await createUser({ role: "supervisor" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "supervisor" }));

    const response = await decisionRequest("00000000-0000-0000-0000-000000000000", token, { decision: "approved" });
    expect(response.status).toBe(404);
  });

  it("returns 409 when re-deciding an already-decided request", async () => {
    const { user, employee } = await createUser({ role: "supervisor" });
    const { employee: target } = await createUser({ role: "employee" });
    const request = await createOvertimeRequest({ employeeId: target.id, statusCode: "approved" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "supervisor" }));

    const response = await decisionRequest(request.id, token, { decision: "rejected" });
    expect(response.status).toBe(409);
  });
});
