import { sqlClient } from "@/lib/db/client";
import { createOtReportModel } from "@/lib/reports/ot/service";
import { getOtReportPeriod, otReportExportSchema } from "@/lib/reports/ot/options";
import { renderOtReportPdf } from "@/lib/reports/pdf";

function currentBangkokMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

try {
  const { year, month } = currentBangkokMonth();
  const input = otReportExportSchema.parse({
    variant: "monthly-all",
    year,
    month,
    sortRules: [],
  });
  const model = await createOtReportModel(input, "company", "");
  const pdf = await renderOtReportPdf({ variant: input.variant, model, sortRules: input.sortRules });
  const signature = pdf.subarray(0, 5).toString("ascii");
  if (signature !== "%PDF-") throw new Error("PDF signature check failed");
  const period = getOtReportPeriod(year, month);

  process.stdout.write(`${JSON.stringify({
    variant: input.variant,
    year,
    month,
    periodStart: period.startLocalDate,
    periodEnd: period.endLocalDate,
    employees: model.employees.length,
    requests: model.totals.requestCount,
    pdfSignature: signature,
    pdfBytes: pdf.byteLength,
    writesPerformed: 0,
  })}\n`);
} catch {
  process.stderr.write("Live OT report smoke failed. Check the main DATABASE_URL, schema and Playwright browser installation.\n");
  process.exitCode = 1;
} finally {
  await sqlClient.end();
}
