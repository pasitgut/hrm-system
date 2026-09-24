import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET } from "@/app/api/asset-loans/[id]/route";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createAssetLoan, createUser } from "@/tests/setup/factories";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";

async function cookieFor(payload: SessionPayload): Promise<string> {
  return createSessionToken(payload);
}

function apiRequest(url: string, options: { token?: string; method?: string; body?: unknown } = {}) {
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

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/asset-loans/[id]", () => {
  it("returns 403 when an employee reads another employee's loan", async () => {
    const { employee: owner } = await createUser({ role: "employee" });
    const loan = await createAssetLoan({ employeeId: owner.id });
    const { user: otherUser, employee: other } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: otherUser.id, employeeId: other.id, email: otherUser.email, role: "employee" }));

    const response = await GET(apiRequest("http://localhost/api/asset-loans/x", { token }), ctx(loan.id));
    expect(response.status).toBe(403);
  });

  it("returns 404 for an unknown id", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(apiRequest("http://localhost/api/asset-loans/x", { token }), ctx("00000000-0000-0000-0000-000000000000"));
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/asset-loans/[id]", () => {
  it("soft-cancels the caller's own pending loan", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const loan = await createAssetLoan({ employeeId: employee.id, statusCode: "pending" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await DELETE(apiRequest("http://localhost/api/asset-loans/x", { method: "DELETE", token }), ctx(loan.id));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.statusCode).toBe("cancelled");
    expect(payload.item.cancelledByEmployeeId).toBe(employee.id);
  });

  it("returns 403 when cancelling someone else's loan", async () => {
    const { employee: owner } = await createUser({ role: "employee" });
    const loan = await createAssetLoan({ employeeId: owner.id, statusCode: "pending" });
    const { user: otherUser, employee: other } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: otherUser.id, employeeId: other.id, email: otherUser.email, role: "employee" }));

    const response = await DELETE(apiRequest("http://localhost/api/asset-loans/x", { method: "DELETE", token }), ctx(loan.id));
    expect(response.status).toBe(403);
  });

  it("returns 409 when the loan is not pending", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const loan = await createAssetLoan({ employeeId: employee.id, statusCode: "approved", decidedAt: new Date() });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await DELETE(apiRequest("http://localhost/api/asset-loans/x", { method: "DELETE", token }), ctx(loan.id));
    expect(response.status).toBe(409);
  });
});
