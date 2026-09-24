import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { PATCH } from "@/app/api/asset-loans/[id]/return/route";
import { db, closeDb, resetDb } from "@/tests/setup/db";
import { createAsset, createAssetLoan, createUser } from "@/tests/setup/factories";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";
import { assets } from "@/lib/db/schema";

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

describe("PATCH /api/asset-loans/[id]/return", () => {
  it("lets the loan's own employee return it, flipping the asset back to available", async () => {
    const asset = await createAsset({ status: "in_use" });
    const { user, employee } = await createUser({ role: "employee" });
    const loan = await createAssetLoan({ assetId: asset.id, employeeId: employee.id, statusCode: "approved", returnedAt: null });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await PATCH(
      apiRequest("http://localhost/api/asset-loans/x/return", { method: "PATCH", token, body: { returnNote: "สภาพดี" } }),
      ctx(loan.id),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.isReturned).toBe(true);
    expect(payload.item.returnNote).toBe("สภาพดี");

    const [updatedAsset] = await db.select().from(assets).where(eq(assets.id, asset.id));
    expect(updatedAsset.status).toBe("available");
  });

  it("lets an approver (supervisor/ceo) process someone else's return", async () => {
    const asset = await createAsset({ status: "in_use" });
    const { employee: borrower } = await createUser({ role: "employee" });
    const loan = await createAssetLoan({ assetId: asset.id, employeeId: borrower.id, statusCode: "approved", returnedAt: null });
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "supervisor" });
    const token = await cookieFor(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "supervisor" }));

    const response = await PATCH(apiRequest("http://localhost/api/asset-loans/x/return", { method: "PATCH", token, body: {} }), ctx(loan.id));
    expect(response.status).toBe(200);
  });

  it("returns 403 for an unrelated employee", async () => {
    const asset = await createAsset({ status: "in_use" });
    const { employee: borrower } = await createUser({ role: "employee" });
    const loan = await createAssetLoan({ assetId: asset.id, employeeId: borrower.id, statusCode: "approved", returnedAt: null });
    const { user: otherUser, employee: other } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: otherUser.id, employeeId: other.id, email: otherUser.email, role: "employee" }));

    const response = await PATCH(apiRequest("http://localhost/api/asset-loans/x/return", { method: "PATCH", token, body: {} }), ctx(loan.id));
    expect(response.status).toBe(403);
  });

  it("returns 409 when the loan is not an active approved loan", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const loan = await createAssetLoan({ employeeId: employee.id, statusCode: "pending" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await PATCH(apiRequest("http://localhost/api/asset-loans/x/return", { method: "PATCH", token, body: {} }), ctx(loan.id));
    expect(response.status).toBe(409);
  });

  it("returns 409 when the loan was already returned", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const loan = await createAssetLoan({ employeeId: employee.id, statusCode: "approved", returnedAt: new Date() });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await PATCH(apiRequest("http://localhost/api/asset-loans/x/return", { method: "PATCH", token, body: {} }), ctx(loan.id));
    expect(response.status).toBe(409);
  });
});
