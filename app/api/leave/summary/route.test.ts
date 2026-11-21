import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/leave/summary/route";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createEmployee, createLeaveRequest, createUser } from "@/tests/setup/factories";
import { leaveTypes } from "@/lib/db/schema";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

function sessionFor(user: { id: string; employeeId: string; email: string; role: SessionPayload["role"] }): SessionPayload {
  return { sub: user.id, employeeId: user.employeeId, email: user.email, role: user.role };
}

function summaryRequest(query: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `${COOKIE_NAME}=${token}`;
  return GET(new NextRequest(`http://localhost/api/leave/summary${query}`, { headers }));
}

// Summary is always scoped to the current calendar year (no `month` param
// like OT), so every fixture date below is built off "now" rather than a
// hardcoded year.
const year = new Date().getFullYear();
const d = (month: string, day: string) => `${year}-${month}-${day}`;

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/leave/summary", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await summaryRequest("");
    expect(response.status).toBe(401);
  });

  it("pro-rates a tenure-based quota by months of service and caps it at the maximum", async () => {
    await db.insert(leaveTypes).values({ code: "personal", name: "ลากิจ", annualQuotaDays: 6, quotaBasis: "tenure" });
    const newcomer = await createEmployee({ startDate: `${year}-07-01` }); // 6 completed months by year end
    const veteran = await createEmployee({ startDate: `${year - 2}-03-10` });

    const quotaFor = async (employeeId: string) => {
      const { user } = await createUser({ role: "employee", employeeId });
      const token = await createSessionToken(sessionFor({ id: user.id, employeeId, email: user.email, role: "employee" }));
      const payload = await (await summaryRequest("", token)).json();
      return payload.quotas.find((q: { code: string }) => q.code === "personal");
    };

    expect(await quotaFor(newcomer.id)).toMatchObject({ annualQuotaDays: 3, maxAnnualQuotaDays: 6, quotaBasis: "tenure", remainingDays: 3 });
    expect(await quotaFor(veteran.id)).toMatchObject({ annualQuotaDays: 6, maxAnnualQuotaDays: 6, quotaBasis: "tenure", remainingDays: 6 });
  });

  it("returns individual quota math for the caller (self-scoped)", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    // 3-day approved sick leave + 1 half-day approved sick leave = 3.5 used.
    await createLeaveRequest({ employeeId: employee.id, leaveTypeCode: "sick", startOn: d("03", "10"), endOn: d("03", "12"), statusCode: "approved" });
    await createLeaveRequest({ employeeId: employee.id, leaveTypeCode: "sick", startOn: d("04", "01"), endOn: d("04", "01"), session: "am", statusCode: "approved" });
    // Pending requests must not count toward usedDays.
    await createLeaveRequest({ employeeId: employee.id, leaveTypeCode: "sick", startOn: d("05", "01"), endOn: d("05", "01"), statusCode: "pending" });
    // Approved leave for a different type shouldn't bleed into sick's total.
    await createLeaveRequest({ employeeId: employee.id, leaveTypeCode: "annual", startOn: d("06", "01"), endOn: d("06", "02"), statusCode: "approved" });

    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await summaryRequest("", token);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scope).toBe("individual");
    expect(payload.employeeId).toBe(employee.id);
    expect(payload.quotas).toHaveLength(2);

    const sick = payload.quotas.find((q: { code: string }) => q.code === "sick");
    expect(sick.annualQuotaDays).toBe(30);
    expect(sick.usedDays).toBe(3.5);
    expect(sick.remainingDays).toBe(26.5);

    const annual = payload.quotas.find((q: { code: string }) => q.code === "annual");
    expect(annual.annualQuotaDays).toBe(10);
    expect(annual.usedDays).toBe(2);
    expect(annual.remainingDays).toBe(8);
  });

  it("returns 403 when an employee requests another employee's summary", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const { employee: other } = await createUser({ role: "employee" });
    const token = await createSessionToken(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await summaryRequest(`?employeeId=${other.id}`, token);
    expect(response.status).toBe(403);
  });

  it("returns individual scope for supervisor/ceo with employeeId set", async () => {
    const { user: ceoUser, employee: ceo } = await createUser({ role: "executive" });
    const { employee } = await createUser({ role: "employee" });
    await createLeaveRequest({ employeeId: employee.id, leaveTypeCode: "annual", startOn: d("07", "01"), endOn: d("07", "03"), statusCode: "approved" });

    const token = await createSessionToken(sessionFor({ id: ceoUser.id, employeeId: ceo.id, email: ceoUser.email, role: "executive" }));
    const response = await summaryRequest(`?employeeId=${employee.id}`, token);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scope).toBe("individual");
    expect(payload.employeeId).toBe(employee.id);
    const annual = payload.quotas.find((q: { code: string }) => q.code === "annual");
    expect(annual.usedDays).toBe(3);
  });

  it("returns company scope with correct per-employee aggregates for supervisor/ceo with no employeeId", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "hr" });
    const { employee: employeeA } = await createUser({ role: "employee" });
    const { employee: employeeB } = await createUser({ role: "employee" });
    await createLeaveRequest({ employeeId: employeeA.id, leaveTypeCode: "sick", startOn: d("03", "10"), endOn: d("03", "12"), statusCode: "approved" });
    await createLeaveRequest({ employeeId: employeeA.id, leaveTypeCode: "annual", startOn: d("04", "01"), endOn: d("04", "01"), statusCode: "pending" });
    await createLeaveRequest({ employeeId: employeeB.id, leaveTypeCode: "sick", startOn: d("05", "01"), endOn: d("05", "02"), statusCode: "rejected" });

    const token = await createSessionToken(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "hr" }));
    const response = await summaryRequest("", token);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scope).toBe("company");
    expect(payload.byEmployee).toHaveLength(2);

    const rowA = payload.byEmployee.find((row: { employeeId: string }) => row.employeeId === employeeA.id);
    expect(rowA.approvedDays).toBe(3);
    expect(rowA.pendingDays).toBe(1);
    expect(rowA.requestCount).toBe(2);

    const rowB = payload.byEmployee.find((row: { employeeId: string }) => row.employeeId === employeeB.id);
    expect(rowB.approvedDays).toBe(0);
    expect(rowB.pendingDays).toBe(0);
    expect(rowB.requestCount).toBe(1);
  });
});
