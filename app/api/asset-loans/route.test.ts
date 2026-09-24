import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/asset-loans/route";
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

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("GET /api/asset-loans", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await GET(apiRequest("http://localhost/api/asset-loans"));
    expect(response.status).toBe(401);
  });

  it("scopes an employee's loans to themselves", async () => {
    const { user: employeeUser, employee } = await createUser({ role: "employee" });
    const { employee: otherEmployee } = await createUser({ role: "employee" });
    await createAssetLoan({ employeeId: employee.id });
    await createAssetLoan({ employeeId: otherEmployee.id });

    const token = await cookieFor(sessionFor({ id: employeeUser.id, employeeId: employee.id, email: employeeUser.email, role: "employee" }));
    const response = await GET(apiRequest("http://localhost/api/asset-loans", { token }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].employeeId).toBe(employee.id);
    expect(payload.items[0].assetCode).toBeTruthy();
  });

  it("returns 403 when an employee requests another employee's id", async () => {
    const { user: employeeUser, employee } = await createUser({ role: "employee" });
    const { employee: otherEmployee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: employeeUser.id, employeeId: employee.id, email: employeeUser.email, role: "employee" }));
    const response = await GET(apiRequest(`http://localhost/api/asset-loans?employeeId=${otherEmployee.id}`, { token }));
    expect(response.status).toBe(403);
  });

  it("lets a supervisor see all loans, or scope to one employee", async () => {
    const { user: supervisorUser, employee: supervisor } = await createUser({ role: "supervisor" });
    const { employee: employeeA } = await createUser({ role: "employee" });
    const { employee: employeeB } = await createUser({ role: "employee" });
    await createAssetLoan({ employeeId: employeeA.id });
    await createAssetLoan({ employeeId: employeeB.id });

    const token = await cookieFor(sessionFor({ id: supervisorUser.id, employeeId: supervisor.id, email: supervisorUser.email, role: "supervisor" }));

    const all = await GET(apiRequest("http://localhost/api/asset-loans", { token }));
    expect((await all.json()).items).toHaveLength(2);

    const scoped = await GET(apiRequest(`http://localhost/api/asset-loans?employeeId=${employeeA.id}`, { token }));
    const scopedPayload = await scoped.json();
    expect(scopedPayload.items).toHaveLength(1);
    expect(scopedPayload.items[0].employeeId).toBe(employeeA.id);
  });

  it("filters by status", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    await createAssetLoan({ employeeId: employee.id, statusCode: "pending" });
    await createAssetLoan({ employeeId: employee.id, statusCode: "rejected", decidedAt: new Date() });

    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));
    const response = await GET(apiRequest("http://localhost/api/asset-loans?status=pending", { token }));
    const payload = await response.json();

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].statusCode).toBe("pending");
  });
});

describe("POST /api/asset-loans", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await POST(
      apiRequest("http://localhost/api/asset-loans", { method: "POST", body: { assetId: "x", checkoutDate: "2026-09-20", dueDate: "2026-09-27" } }),
    );
    expect(response.status).toBe(401);
  });

  it("creates a pending loan for an available asset", async () => {
    const asset = await createAsset({ status: "available" });
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      apiRequest("http://localhost/api/asset-loans", {
        method: "POST",
        token,
        body: { assetId: asset.id, checkoutDate: "2026-09-20", dueDate: "2026-09-27", purpose: "ใช้งานนอกสถานที่" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.item.statusCode).toBe("pending");
    expect(payload.item.employeeId).toBe(employee.id);
    expect(payload.item.assetId).toBe(asset.id);
    expect(payload.item.checkoutDate).toBe("2026-09-20");
    expect(payload.item.dueDate).toBe("2026-09-27");
  });

  it("rejects a request for an asset that is not available", async () => {
    const asset = await createAsset({ status: "in_use" });
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      apiRequest("http://localhost/api/asset-loans", {
        method: "POST",
        token,
        body: { assetId: asset.id, checkoutDate: "2026-09-20", dueDate: "2026-09-27" },
      }),
    );
    expect(response.status).toBe(409);
  });

  it("rejects checkoutDate after dueDate with 400", async () => {
    const asset = await createAsset({ status: "available" });
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      apiRequest("http://localhost/api/asset-loans", {
        method: "POST",
        token,
        body: { assetId: asset.id, checkoutDate: "2026-09-27", dueDate: "2026-09-20" },
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown asset", async () => {
    const { user, employee } = await createUser({ role: "employee" });
    const token = await cookieFor(sessionFor({ id: user.id, employeeId: employee.id, email: user.email, role: "employee" }));

    const response = await POST(
      apiRequest("http://localhost/api/asset-loans", {
        method: "POST",
        token,
        body: { assetId: "00000000-0000-0000-0000-000000000000", checkoutDate: "2026-09-20", dueDate: "2026-09-27" },
      }),
    );
    expect(response.status).toBe(404);
  });
});
