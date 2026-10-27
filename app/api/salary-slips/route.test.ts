import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, closeDb, resetDb } from "@/tests/setup/db";
import { createEmployee, createUser } from "@/tests/setup/factories";
import { fixtureData, fixtureWorkbook } from "@/tests/setup/salary-slips";
import { createSessionToken, COOKIE_NAME } from "@/lib/auth/session";
import { salarySlipImports, salarySlips, salarySlipVersions } from "@/lib/db/schema";
import { commitImport, previewImport } from "@/lib/salary-slips/service";
import { GET } from "./route";
import { POST as UPLOAD } from "./imports/route";
import { POST as COMMIT } from "./imports/[id]/commit/route";
import { POST as EXPORT } from "./export/route";
import { removeSource } from "@/lib/salary-slips/storage";
import type { ImportFile } from "@/lib/salary-slips/model";

const grants = ["salary_slips.view", "salary_slips.import", "salary_slips.replace", "salary_slips.export"];
const sources: ImportFile[] = [];
beforeEach(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!/test$/.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Salary integration tests require a local test database");
  await resetDb();
});
afterAll(async () => { await Promise.allSettled(sources.map((source) => removeSource(source.path))); await closeDb(); });
function request(url: string, token?: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, { method: body ? "POST" : "GET", headers: { ...(token ? { cookie: `${COOKIE_NAME}=${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
async function hr(permissions = grants) {
  const { user, employee } = await createUser({ permissions });
  const context = { sub: user.id, employeeId: employee!.id, email: user.email, role: user.role, permissions };
  return { context, token: await createSessionToken(context) };
}
async function batch(createdBy: string, data = fixtureData()) {
  const [item] = await db.insert(salarySlipImports).values({ createdBy, files: [], rows: [{ key: "0:10", file: "test.xlsx", sheet: "Payroll", row: 10, data, errors: [], warnings: [] }] }).returning();
  return item;
}
describe("salary slip integration", () => {
  it("rejects unauthenticated and unauthorized access without exposing salaries", async () => {
    expect((await GET(request("/api/salary-slips"))).status).toBe(401);
    const { token } = await hr([]);
    expect((await GET(request("/api/salary-slips", token))).status).toBe(403);
    expect((await EXPORT(request("/api/salary-slips/export", token, { year: 2026, ids: [], format: "pdf" }))).status).toBe(403);
  });
  it("uploads, matches, commits, skips unchanged data, and retains immutable versions", async () => {
    const { context, token } = await hr();
    const employee = await createEmployee({ code: "0001" });
    const form = new FormData(); form.append("files", new File([new Uint8Array(await fixtureWorkbook())], "payroll.xlsx"));
    const response = await UPLOAD(new NextRequest("http://localhost/api/salary-slips/imports", { method: "POST", headers: { cookie: `${COOKIE_NAME}=${token}` }, body: form }));
    expect(response.status).toBe(201);
    const preview = await response.json();
    const [stored] = await db.select().from(salarySlipImports).where(eq(salarySlipImports.id, preview.id)); sources.push(...stored.files);
    expect(preview.rows[0].employeeId).toBe(employee.id);
    const selection = [{ key: "0:10", employeeId: employee.id, expectedRevision: 0, replace: false }];
    const committed = await COMMIT(request("/api/salary-slips/imports/commit", token, { selections: selection }), { params: Promise.resolve({ id: preview.id }) });
    expect(committed.status).toBe(200); expect((await committed.json()).inserted).toBe(1);
    const second = await batch(context.sub);
    expect((await previewImport(second.id)).rows[0].status).toBe("unchanged");
    expect(await commitImport(second.id, [{ ...selection[0], expectedRevision: 1 }], "", context)).toMatchObject({ unchanged: 1 });
    expect(await db.select().from(salarySlipVersions)).toHaveLength(1);
    const changed = fixtureData({ name: "ชื่อใหม่", incomeTotal: 1100000, netPay: 1030000, incomes: { ...fixtureData().incomes, salary: 1100000 } });
    const replacement = await batch(context.sub, changed);
    await expect(commitImport(replacement.id, [{ ...selection[0], expectedRevision: 1, replace: true }], "", context)).rejects.toThrow("เหตุผล");
    await expect(commitImport(replacement.id, [{ ...selection[0], expectedRevision: 1, replace: true }], "แก้ยอด", { ...context, permissions: ["salary_slips.view", "salary_slips.import"] })).rejects.toMatchObject({ status: 403 });
    await commitImport(replacement.id, [{ ...selection[0], expectedRevision: 1, replace: true }], "แก้ยอด", context);
    const versions = await db.select().from(salarySlipVersions);
    expect(versions).toHaveLength(2); expect(versions.find((item) => item.revision === 1)!.data.name).toBe("ทดสอบ สลิป");
    expect((await db.select().from(salarySlips))[0].revision).toBe(2);
  });
  it("rolls back the whole import if a later row fails validation", async () => {
    const { context } = await hr(); const employee = await createEmployee({ code: "0001" });
    const original = await batch(context.sub);
    await db.update(salarySlipImports).set({ rows: [...original.rows, { ...original.rows[0], key: "0:11", data: fixtureData({ month: 2 }), errors: ["ยอดไม่ตรง"] }] }).where(eq(salarySlipImports.id, original.id));
    await expect(commitImport(original.id, ["0:10", "0:11"].map((key) => ({ key, employeeId: employee.id, expectedRevision: 0, replace: false })), "", context)).rejects.toThrow("ผิดพลาด");
    expect(await db.select().from(salarySlips)).toHaveLength(0);
  });
  it("requires remapping unknown codes and rejects stale or repeated commits", async () => {
    const { context } = await hr(); const employee = await createEmployee(); const source = await batch(context.sub);
    expect((await previewImport(source.id)).rows[0].errors).toContain("กรุณาจับคู่พนักงาน");
    const selections = [{ key: "0:10", employeeId: employee.id, expectedRevision: 0, replace: false }];
    await commitImport(source.id, selections, "", context);
    await expect(commitImport(source.id, selections, "", context)).rejects.toMatchObject({ status: 409 });
    const stale = await batch(context.sub);
    await expect(commitImport(stale.id, selections, "", context)).rejects.toMatchObject({ status: 409 });
  });
  it("warns for missing YTD months and exports after acknowledgment", async () => {
    const { context, token } = await hr(); const employee = await createEmployee(); const source = await batch(context.sub, fixtureData({ month: 3 }));
    await commitImport(source.id, [{ key: "0:10", employeeId: employee.id, expectedRevision: 0, replace: false }], "", context);
    const [slip] = await db.select().from(salarySlips);
    const body = { year: 2026, ids: [slip.id], format: "xlsx" };
    const warning = await EXPORT(request("/api/salary-slips/export", token, body));
    expect(warning.status).toBe(409); expect((await warning.json()).missing[0].missingMonths).toEqual([1, 2]);
    const exported = await EXPORT(request("/api/salary-slips/export", token, { ...body, acknowledgeMissing: true }));
    expect(exported.status).toBe(200); expect(exported.headers.get("Cache-Control")).toBe("no-store");
    expect((await exported.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    const pdf = await EXPORT(request("/api/salary-slips/export", token, { ...body, format: "pdf", acknowledgeMissing: true }));
    expect(pdf.status).toBe(200); expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
  it("rejects cross-origin mutations", async () => {
    const { token } = await hr();
    const response = await EXPORT(new NextRequest("http://localhost/api/salary-slips/export", { method: "POST", headers: { cookie: `${COOKIE_NAME}=${token}`, origin: "https://example.com" } }));
    expect(response.status).toBe(403);
  });
});
