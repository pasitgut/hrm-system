import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatLeaveDays } from "@/lib/reports/leave/model";
import { leaveReportExportSchema } from "@/lib/reports/leave/options";
import { createLeaveReportModel } from "@/lib/reports/leave/service";
import { renderLeaveReportPdf } from "@/lib/reports/pdf";
import { sqlClient } from "@/lib/db/client";

const now = new Date();
const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(now);
const year = Number(parts.find((part) => part.type === "year")?.value);
const month = Number(parts.find((part) => part.type === "month")?.value);
const input = leaveReportExportSchema.parse({ variant: "monthly-all", year, month, sortRules: [] });

try {
  const model = await createLeaveReportModel(input, "company", "00000000-0000-4000-8000-000000000001");
  const pdf = await renderLeaveReportPdf({ variant: input.variant, model, sortRules: input.sortRules });
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("Invalid PDF signature");

  const outputDirectory = path.join(process.cwd(), "output", "pdf", "leave-reports");
  await mkdir(outputDirectory, { recursive: true });
  const destination = path.join(outputDirectory, `leave-monthly-${year}-${String(month).padStart(2, "0")}.pdf`);
  await writeFile(destination, pdf);

  const typeTotals = model.types.map((type) => ({
    code: type.code,
    name: type.name,
    approvedDays: formatLeaveDays(model.totals.byType[type.code] ?? 0),
  }));
  process.stdout.write(JSON.stringify({
    variant: input.variant,
    year,
    month,
    employeeCount: model.employees.length,
    approvedRequestCount: model.totals.requestCount,
    typeTotals,
    totalApprovedDays: formatLeaveDays(model.totals.daysHalfUnits),
    pdfSignature: pdf.subarray(0, 5).toString("ascii"),
    pdfBytes: pdf.byteLength,
    destination: path.relative(process.cwd(), destination),
    writesPerformed: 0,
  }, null, 2) + "\n");
} finally {
  await sqlClient.end({ timeout: 1 });
}
