import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db, closeDb, resetDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";
import { fixtureWorkbook } from "@/tests/setup/salary-slips";
import { createSessionToken, COOKIE_NAME } from "@/lib/auth/session";
import { salarySlipImports, salarySlips } from "@/lib/db/schema";
import { POST as EXPORT } from "./export/route";

const grants = ["salary_slips.view", "salary_slips.export"];

beforeEach(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!/test$/.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Salary integration tests require a local test database");
  }
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

async function hr(permissions = grants) {
  const { user, employee } = await createUser({ permissions });
  const context = { sub: user.id, employeeId: employee!.id, email: user.email, role: user.role, permissions };
  return { context, token: await createSessionToken(context) };
}

function exportFormRequest(form: FormData, token?: string, origin?: string) {
  return new NextRequest("http://localhost/api/salary-slips/export", {
    method: "POST",
    headers: {
      ...(token ? { cookie: `${COOKIE_NAME}=${token}` } : {}),
      ...(origin ? { origin } : {}),
    },
    body: form,
  });
}

describe("stateless salary slip export API", () => {
  it("rejects unauthenticated, unauthorized, and cross-origin requests", async () => {
    const form = new FormData();
    form.append("format", "pdf");

    expect((await EXPORT(exportFormRequest(form))).status).toBe(401);

    const noPerm = await hr([]);
    expect((await EXPORT(exportFormRequest(form, noPerm.token))).status).toBe(403);

    const permitted = await hr();
    expect((await EXPORT(exportFormRequest(form, permitted.token, "https://example.com"))).status).toBe(403);
  });

  it("uploads multi-month .xlsx files and exports .pdf and .xlsx directly without touching DB", async () => {
    const { token } = await hr();
    const jan = await fixtureWorkbook((sheet) => { sheet.getCell("E10").value = "31/01/2569"; });
    const feb = await fixtureWorkbook((sheet) => { sheet.getCell("E10").value = "28/02/2569"; });

    const pdfForm = new FormData();
    pdfForm.append("files", new File([new Uint8Array(jan)], "jan.xlsx"));
    pdfForm.append("files", new File([new Uint8Array(feb)], "feb.xlsx"));
    pdfForm.append("format", "pdf");
    pdfForm.append("year", "2026");
    pdfForm.append("month", "2");

    const pdfResponse = await EXPORT(exportFormRequest(pdfForm, token));
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers.get("content-type")).toBe("application/pdf");
    expect(pdfResponse.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await pdfResponse.arrayBuffer()).subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const xlsxForm = new FormData();
    xlsxForm.append("files", new File([new Uint8Array(jan)], "jan.xlsx"));
    xlsxForm.append("files", new File([new Uint8Array(feb)], "feb.xlsx"));
    xlsxForm.append("format", "xlsx");
    xlsxForm.append("year", "2026");
    xlsxForm.append("month", "2");

    const xlsxResponse = await EXPORT(exportFormRequest(xlsxForm, token));
    expect(xlsxResponse.status).toBe(200);
    expect((await xlsxResponse.arrayBuffer()).byteLength).toBeGreaterThan(1000);

    // Stateless: nothing is written to salary_slip_imports or salary_slips.
    expect(await db.select().from(salarySlipImports)).toHaveLength(0);
    expect(await db.select().from(salarySlips)).toHaveLength(0);
  });

  it("warns on missing YTD months and exports after acknowledgeMissing=true", async () => {
    const { token } = await hr();
    const mar = await fixtureWorkbook((sheet) => { sheet.getCell("E10").value = "31/03/2569"; });

    const warnForm = new FormData();
    warnForm.append("files", new File([new Uint8Array(mar)], "mar.xlsx"));
    warnForm.append("format", "pdf");
    warnForm.append("year", "2026");
    warnForm.append("month", "3");

    const warning = await EXPORT(exportFormRequest(warnForm, token));
    expect(warning.status).toBe(409);
    expect((await warning.json()).missing[0].missingMonths).toEqual([1, 2]);

    const ackForm = new FormData();
    ackForm.append("files", new File([new Uint8Array(mar)], "mar.xlsx"));
    ackForm.append("format", "pdf");
    ackForm.append("year", "2026");
    ackForm.append("month", "3");
    ackForm.append("acknowledgeMissing", "true");

    const exported = await EXPORT(exportFormRequest(ackForm, token));
    expect(exported.status).toBe(200);
    expect(Buffer.from(await exported.arrayBuffer()).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
