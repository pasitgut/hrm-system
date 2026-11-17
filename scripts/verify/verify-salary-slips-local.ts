// Local, isolated API and PDFMake QA. Never touches the development database or existing accounts.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, sqlClient } from "@/lib/db/client";
import { employees, users, salarySlips, salarySlipImports, salarySlipVersions } from "@/lib/db/schema";
import { createSessionToken, COOKIE_NAME } from "@/lib/auth/session";
import { fixtureData, fixtureWorkbook } from "@/tests/setup/salary-slips";
import { createExcel, createPdf } from "@/lib/salary-slips/documents";
import { withCumulative } from "@/lib/salary-slips/model";
import { removeSource } from "@/lib/salary-slips/storage";

const database = new URL(process.env.DATABASE_URL!);
assert(["localhost", "127.0.0.1"].includes(database.hostname) && /test$/.test(database.pathname), "Use a local test database");
const baseUrl = process.env.SALARY_SLIPS_VERIFY_URL || "http://localhost:3105";
assert(["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname));
const output = path.join(process.cwd(), ".local-data/salary-slips-verification");
await mkdir(output, { recursive: true });
const permissions = ["salary_slips.view", "salary_slips.import", "salary_slips.replace", "salary_slips.export"];
let employeeId: string | undefined;
let userId: string | undefined;
let token = "";

try {
  const [employee] = await db.insert(employees).values({ code: "VFY1", firstName: "พนักงานทดสอบ", lastName: "สลิป", startDate: "2026-01-01" }).returning();
  employeeId = employee.id;
  const [user] = await db.insert(users).values({ employeeId: employee.id, email: `salary-verify-${employee.id}@example.invalid`, passwordHash: "disabled-verification-account", permissions }).returning();
  userId = user.id;
  token = await createSessionToken({ sub: user.id, employeeId: employee.id, email: user.email, role: "employee", permissions });

  const headers = { cookie: `${COOKIE_NAME}=${token}`, origin: baseUrl };
  const form = new FormData();
  const workbook = await fixtureWorkbook((sheet) => { sheet.getCell("B10").value = "VFY1"; });
  form.append("files", new File([new Uint8Array(workbook)], "verify.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const imported = await fetch(new URL("/api/salary-slips/imports", baseUrl), { method: "POST", headers, body: form });
  if (imported.status !== 201) throw new Error(`Import API returned ${imported.status}: ${await imported.text()}`);
  const preview = await imported.json();
  assert.equal(preview.rows.length, 1);
  assert.ok(preview.id);

  const committed = await fetch(new URL(`/api/salary-slips/imports/${preview.id}/commit`, baseUrl), {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ selections: [{ key: preview.rows[0].key, employeeId, expectedRevision: 0, replace: false }] }),
  });
  if (committed.status !== 200) throw new Error(`Commit API returned ${committed.status}: ${await committed.text()}`);
  assert.equal((await committed.json()).inserted, 1);
  const [storedSlip] = await db.select().from(salarySlips).where(eq(salarySlips.employeeId, employeeId));
  assert.ok(storedSlip, "The local import created a salary slip");

  const download = await fetch(new URL("/api/salary-slips/export", baseUrl), {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ year: 2026, ids: [storedSlip.id], format: "pdf", acknowledgeMissing: true }),
  });
  if (download.status !== 200) throw new Error(`PDF export API returned ${download.status}: ${await download.text()}`);
  const downloadedPdf = Buffer.from(await download.arrayBuffer());
  assert.equal(downloadedPdf.subarray(0, 5).toString("ascii"), "%PDF-");
  await writeFile(path.join(output, "downloaded-slip.pdf"), downloadedPdf);

  const items = withCumulative(Array.from({ length: 20 }, (_, employeeIndex) => Array.from({ length: 12 }, (_, index) => ({
    id: `${employeeIndex}:${index}`,
    employeeId: String(employeeIndex),
    revision: 1,
    data: fixtureData({ code: `T${String(employeeIndex).padStart(3, "0")}`, name: `พนักงานทดสอบ ${employeeIndex + 1}`, month: index + 1 }),
  }))).flat());
  const started = Date.now();
  const [excel, pdf] = await Promise.all([createExcel(items), createPdf(items)]);
  const pageObjects = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? [];
  assert.equal(pageObjects.length, 240, "Exactly one PDF page per salary slip");
  await writeFile(path.join(output, "20-employees-12-months.xlsx"), excel);
  await writeFile(path.join(output, "20-employees-12-months.pdf"), pdf);
  console.log(JSON.stringify({ api: "passed", slips: items.length, pdfPages: pageObjects.length, generationMs: Date.now() - started, excelBytes: excel.length, pdfBytes: pdf.length, output }));
} finally {
  if (employeeId && userId) {
    const ownSlips = await db.select({ id: salarySlips.id }).from(salarySlips).where(eq(salarySlips.employeeId, employeeId));
    if (ownSlips.length) await db.delete(salarySlipVersions).where(inArray(salarySlipVersions.slipId, ownSlips.map((slip) => slip.id)));
    await db.delete(salarySlips).where(eq(salarySlips.employeeId, employeeId));
    const imports = await db.select().from(salarySlipImports).where(eq(salarySlipImports.createdBy, userId));
    await db.delete(salarySlipImports).where(eq(salarySlipImports.createdBy, userId));
    await Promise.allSettled(imports.flatMap((batch) => batch.files.map((file) => removeSource(file.path))));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(employees).where(eq(employees.id, employeeId));
  }
  await sqlClient.end();
}
