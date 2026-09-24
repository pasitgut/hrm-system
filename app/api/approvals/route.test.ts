import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/approvals/route";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createLeaveRequest, createOvertimeRequest, createUser } from "@/tests/setup/factories";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

function sessionFor(user: { id: string; employeeId: string; email: string; role: SessionPayload["role"] }): SessionPayload {
  return { sub: user.id, employeeId: user.employeeId, email: user.email, role: user.role };
}

function approvalsRequest(url: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `${COOKIE_NAME}=${token}`;
  return new NextRequest(url, { headers });
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/approvals", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await GET(approvalsRequest("http://localhost/api/approvals"));
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid type filter", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(approvalsRequest("http://localhost/api/approvals?type=bogus", token));
    expect(response.status).toBe(400);
  });

  it("returns correctly-normalized OT and leave items for a supervisor, newest first", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "supervisor" });
    const { employee } = await createUser({ role: "employee" });

    const ot = await createOvertimeRequest({
      employeeId: employee.id,
      startAt: new Date("2026-09-10T11:00:00Z"), // 18:00 Bangkok
      endAt: new Date("2026-09-10T13:00:00Z"), // 20:00 Bangkok
      reason: "ปิดงาน release",
      createdAt: new Date("2026-09-09T10:00:00Z"),
    });
    const leave = await createLeaveRequest({
      employeeId: employee.id,
      leaveTypeCode: "sick",
      startOn: "2026-09-22",
      endOn: "2026-09-24",
      reason: "ไม่สบาย",
      createdAt: new Date("2026-09-09T11:00:00Z"),
    });
    const token = await createSessionToken(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "supervisor" }));
    const response = await GET(approvalsRequest("http://localhost/api/approvals?type=all", token));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(2);

    // newest-first by createdAt: leave, then OT
    expect(payload.items.map((item: { id: string }) => item.id)).toEqual([leave.id, ot.id]);

    const otItem = payload.items.find((item: { id: string }) => item.id === ot.id);
    expect(otItem.type).toBe("ot");
    expect(otItem.kind).toBe("ทำ OT");
    expect(otItem.employeeId).toBe(employee.id);
    expect(otItem.detail).toBe("10 ก.ย. 2569 · 18:00–20:00 · 2 ชม.");
    expect(otItem.reason).toBe("ปิดงาน release");
    expect(otItem.statusCode).toBe("pending");
    expect(otItem.statusName).toBe("รอจัดการ");

    const leaveItem = payload.items.find((item: { id: string }) => item.id === leave.id);
    expect(leaveItem.type).toBe("leave");
    expect(leaveItem.kind).toBe("ลาป่วย");
    expect(leaveItem.detail).toBe("22–24 ก.ย. 2569 · ลาป่วย");
    expect(leaveItem.reason).toBe("ไม่สบาย");

  });

  it("filters by type", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "supervisor" });
    const { employee } = await createUser({ role: "employee" });
    await createOvertimeRequest({ employeeId: employee.id });
    await createLeaveRequest({ employeeId: employee.id });
    const token = await createSessionToken(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "supervisor" }));

    const otOnly = await GET(approvalsRequest("http://localhost/api/approvals?type=ot", token));
    const otPayload = await otOnly.json();
    expect(otPayload.items).toHaveLength(1);
    expect(otPayload.items[0].type).toBe("ot");

    const leaveOnly = await GET(approvalsRequest("http://localhost/api/approvals?type=leave", token));
    const leavePayload = await leaveOnly.json();
    expect(leavePayload.items).toHaveLength(1);
    expect(leavePayload.items[0].type).toBe("leave");

  });

  it("scopes an employee to only their own OT and leave requests", async () => {
    const { user: employeeUser, employee } = await createUser({ role: "employee" });
    const { employee: otherEmployee } = await createUser({ role: "employee" });

    await createOvertimeRequest({ employeeId: employee.id });
    await createLeaveRequest({ employeeId: employee.id });
    await createOvertimeRequest({ employeeId: otherEmployee.id });
    await createLeaveRequest({ employeeId: otherEmployee.id });

    const token = await createSessionToken(sessionFor({ id: employeeUser.id, employeeId: employee.id, email: employeeUser.email, role: "employee" }));
    const response = await GET(approvalsRequest("http://localhost/api/approvals?type=all", token));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(2);
    expect(payload.items.every((item: { employeeId: string }) => item.employeeId === employee.id)).toBe(true);
  });

  it("lets a supervisor see everyone's requests unscoped", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "supervisor" });
    const { employee: employeeA } = await createUser({ role: "employee" });
    const { employee: employeeB } = await createUser({ role: "employee" });
    await createOvertimeRequest({ employeeId: employeeA.id });
    await createOvertimeRequest({ employeeId: employeeB.id });

    const token = await createSessionToken(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "supervisor" }));
    const response = await GET(approvalsRequest("http://localhost/api/approvals?type=ot", token));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(2);
  });
});
