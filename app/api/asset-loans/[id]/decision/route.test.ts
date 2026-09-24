import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { PATCH } from "@/app/api/asset-loans/[id]/decision/route";
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

describe("PATCH /api/asset-loans/[id]/decision", () => {
  it("returns 403 for an employee", async () => {
    const loan = await createAssetLoan();
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await PATCH(
      apiRequest("http://localhost/api/asset-loans/x/decision", { method: "PATCH", token, body: { decision: "approved" } }),
      ctx(loan.id),
    );
    expect(response.status).toBe(403);
  });

  it("approving flips the linked asset's status to in_use", async () => {
    const asset = await createAsset({ status: "available" });
    const loan = await createAssetLoan({ assetId: asset.id, statusCode: "pending" });
    const { user, employee } = await createUser({ role: "supervisor" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "supervisor" }));

    const response = await PATCH(
      apiRequest("http://localhost/api/asset-loans/x/decision", { method: "PATCH", token, body: { decision: "approved", note: "อนุมัติ" } }),
      ctx(loan.id),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.statusCode).toBe("approved");
    expect(payload.item.decidedByEmployeeId).toBe(employee.id);

    const [updatedAsset] = await db.select().from(assets).where(eq(assets.id, asset.id));
    expect(updatedAsset.status).toBe("in_use");
  });

  it("rejecting leaves the asset's status untouched", async () => {
    const asset = await createAsset({ status: "available" });
    const loan = await createAssetLoan({ assetId: asset.id, statusCode: "pending" });
    const { user, employee } = await createUser({ role: "ceo" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "ceo" }));

    const response = await PATCH(
      apiRequest("http://localhost/api/asset-loans/x/decision", { method: "PATCH", token, body: { decision: "rejected" } }),
      ctx(loan.id),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.statusCode).toBe("rejected");

    const [updatedAsset] = await db.select().from(assets).where(eq(assets.id, asset.id));
    expect(updatedAsset.status).toBe("available");
  });

  it("returns 409 when re-deciding an already-decided loan", async () => {
    const loan = await createAssetLoan({ statusCode: "approved", decidedAt: new Date() });
    const { user, employee } = await createUser({ role: "ceo" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "ceo" }));

    const response = await PATCH(
      apiRequest("http://localhost/api/asset-loans/x/decision", { method: "PATCH", token, body: { decision: "rejected" } }),
      ctx(loan.id),
    );
    expect(response.status).toBe(409);
  });
});
