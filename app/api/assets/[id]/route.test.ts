import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH } from "@/app/api/assets/[id]/route";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createAsset, createAssetLoan, createUser } from "@/tests/setup/factories";
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

describe("GET /api/assets/[id]", () => {
  it("returns 404 for an unknown id", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(apiRequest("http://localhost/api/assets/nope", { token }), ctx("00000000-0000-0000-0000-000000000000"));
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/assets/[id]", () => {
  it("returns 403 for an employee", async () => {
    const asset = await createAsset();
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await PATCH(apiRequest("http://localhost/api/assets/x", { method: "PATCH", token, body: { name: "y" } }), ctx(asset.id));
    expect(response.status).toBe(403);
  });

  it("lets a supervisor edit an asset, including manually setting status", async () => {
    const asset = await createAsset({ name: "เดิม" });
    const { user, employee } = await createUser({ role: "supervisor" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "supervisor" }));
    const response = await PATCH(
      apiRequest("http://localhost/api/assets/x", { method: "PATCH", token, body: { name: "ใหม่", status: "maintenance" } }),
      ctx(asset.id),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.name).toBe("ใหม่");
    expect(payload.item.status).toBe("maintenance");
  });

  it("returns 404 for an unknown id", async () => {
    const { user, employee } = await createUser({ role: "ceo" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "ceo" }));
    const response = await PATCH(
      apiRequest("http://localhost/api/assets/x", { method: "PATCH", token, body: { name: "y" } }),
      ctx("00000000-0000-0000-0000-000000000000"),
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/assets/[id]", () => {
  it("soft-retires an asset with no active loan", async () => {
    const asset = await createAsset({ status: "available" });
    const { user, employee } = await createUser({ role: "ceo" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "ceo" }));
    const response = await DELETE(apiRequest("http://localhost/api/assets/x", { method: "DELETE", token }), ctx(asset.id));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.item.status).toBe("retired");
  });

  it("returns 409 when the asset has an active loan", async () => {
    const asset = await createAsset({ status: "in_use" });
    await createAssetLoan({ assetId: asset.id, statusCode: "approved", returnedAt: null });
    const { user, employee } = await createUser({ role: "ceo" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "ceo" }));
    const response = await DELETE(apiRequest("http://localhost/api/assets/x", { method: "DELETE", token }), ctx(asset.id));
    expect(response.status).toBe(409);
  });

  it("returns 403 for a supervisor-restricted employee role", async () => {
    const asset = await createAsset();
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await DELETE(apiRequest("http://localhost/api/assets/x", { method: "DELETE", token }), ctx(asset.id));
    expect(response.status).toBe(403);
  });
});
