import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/ot/summary/route";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createOvertimeRequest, createUser } from "@/tests/setup/factories";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

function sessionFor(user: { id: string; employeeId: string; email: string; role: SessionPayload["role"] }): SessionPayload {
  return { sub: user.id, employeeId: user.employeeId, email: user.email, role: user.role };
}

function summaryRequest(query: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `${COOKIE_NAME}=${token}`;
  return GET(new NextRequest(`http://localhost/api/ot/summary${query}`, { headers }));
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/ot/summary", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await summaryRequest("?month=2026-09");
    expect(response.status).toBe(401);
  });

  it("is always individual/self-scoped for an employee, even if employeeId is passed", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    await createOvertimeRequest({ employeeId: employee.id, statusCode: "approved", startAt: new Date("2026-09-10T11:00:00Z"), endAt: new Date("2026-09-10T13:00:00Z") });
    await createOvertimeRequest({ employeeId: employee.id, statusCode: "pending", startAt: new Date("2026-09-12T11:00:00Z"), endAt: new Date("2026-09-12T12:00:00Z") });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await summaryRequest(`?month=2026-09&employeeId=${employee.id}`, token);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scope).toBe("individual");
    expect(payload.employeeId).toBe(employee.id);
    expect(payload.totalApprovedHours).toBe(2);
    expect(payload.totalPendingHours).toBe(1);
    expect(payload.requestCount).toBe(2);
  });

  it("returns 403 when an employee requests another employee's summary", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const { employee: other } = await createUser({ role: "employee" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await summaryRequest(`?month=2026-09&employeeId=${other.id}`, token);
    expect(response.status).toBe(403);
  });

  it("returns company scope with correct per-employee sums for supervisor/ceo with no employeeId", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "hr" });
    const { employee: employeeA } = await createUser({ role: "employee" });
    const { employee: employeeB } = await createUser({ role: "employee" });
    await createOvertimeRequest({ employeeId: employeeA.id, statusCode: "approved", startAt: new Date("2026-09-10T11:00:00Z"), endAt: new Date("2026-09-10T13:00:00Z") });
    await createOvertimeRequest({ employeeId: employeeA.id, statusCode: "pending", startAt: new Date("2026-09-11T11:00:00Z"), endAt: new Date("2026-09-11T12:30:00Z") });
    await createOvertimeRequest({ employeeId: employeeB.id, statusCode: "rejected", startAt: new Date("2026-09-12T11:00:00Z"), endAt: new Date("2026-09-12T14:00:00Z") });

    const token = await createSessionToken(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "hr" }));
    const response = await summaryRequest("?month=2026-09", token);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scope).toBe("company");
    expect(payload.totalApprovedHours).toBe(2);
    expect(payload.totalPendingHours).toBe(1.5);
    expect(payload.requestCount).toBe(3);
    // Company scope lists every employee, including ones with no requests (the supervisor here).
    expect(payload.byEmployee).toHaveLength(3);
    expect(payload.byEmployee.find((row: { employeeId: string }) => row.employeeId === supervisor.id).requestCount).toBe(0);

    const rowA = payload.byEmployee.find((row: { employeeId: string }) => row.employeeId === employeeA.id);
    expect(rowA.approvedHours).toBe(2);
    expect(rowA.pendingHours).toBe(1.5);
    expect(rowA.requestCount).toBe(2);

    const rowB = payload.byEmployee.find((row: { employeeId: string }) => row.employeeId === employeeB.id);
    expect(rowB.rejectedHours).toBe(3);
    expect(rowB.requestCount).toBe(1);
  });

  it("returns individual scope for supervisor/ceo with employeeId set", async () => {
    const { user: ceoUser, employee: ceo } = await createUser({ role: "executive" });
    const { employee } = await createUser({ role: "employee" });
    await createOvertimeRequest({ employeeId: employee.id, statusCode: "approved", startAt: new Date("2026-09-10T11:00:00Z"), endAt: new Date("2026-09-10T13:00:00Z") });

    const token = await createSessionToken(sessionFor({ id: ceoUser.id, employeeId: ceo.id, email: ceoUser.email, role: "executive" }));
    const response = await summaryRequest(`?month=2026-09&employeeId=${employee.id}`, token);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scope).toBe("individual");
    expect(payload.employeeId).toBe(employee.id);
    expect(payload.totalApprovedHours).toBe(2);
  });
});
