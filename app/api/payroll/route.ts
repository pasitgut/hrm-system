import { NextRequest, NextResponse } from "next/server";
import { bufferToReadableStream } from "@/lib/api/stream";
import { requireApiPermission } from "@/lib/auth/dal";
import {
  createBankTransferTxt,
  createBankTransferWorkbook,
  createGlJournalCsv,
  createKt20kWorkbook,
  createPnd1kWorkbook,
  createPnd1Workbook,
  createSso110Workbook,
  filterAndSortPayrollRows,
  type PayrollReportFilterOptions,
} from "@/lib/payroll/exports";
import { describeIncompleteRows } from "@/lib/payroll/readiness";
import { createPayroll, listPayrollPeriods } from "@/lib/payroll/service";
import { createPayrollSummarySheetPdf, createPayrollSummarySheetWorkbook } from "@/lib/payroll/summary-sheet";
import { createPayrollMatrixWorkbook, createPayrollWorkbook } from "@/lib/payroll/workbook";
import { salaryRoute } from "@/app/api/salary-slips/_shared";

export const runtime = "nodejs";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_CONTENT_TYPE = "application/pdf";
const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
const TXT_CONTENT_TYPE = "text/plain; charset=utf-8";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isValidYear(year: number) {
  return Number.isInteger(year) && year >= 1900 && year <= 2200;
}

function isValidPeriod(year: number, month: number) {
  return isValidYear(year) && Number.isInteger(month) && month >= 1 && month <= 12;
}

function parseFilterOptions(params: URLSearchParams): PayrollReportFilterOptions {
  const rawDepts = params.get("departments") ?? "";
  const departments = rawDepts
    ? rawDepts.split(",").map((item) => item.trim()).filter(Boolean)
    : undefined;
  const employeeId = params.get("employeeId")?.trim() || undefined;
  const sortRaw = params.get("sortBy");
  const sortBy = sortRaw === "name" || sortRaw === "department" ? sortRaw : "code";
  const filingType = params.get("filingType") === "additional" ? "additional" : "normal";
  return { departments, employeeId, sortBy, filingType };
}

function attachmentResponse(buffer: Buffer, contentType: string, filename: string) {
  return new Response(bufferToReadableStream(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// GET /api/payroll?year=&listPeriods=1                        -> 12 periods list for the year
// GET /api/payroll?year=&month=                             -> payroll JSON for the period
// GET /api/payroll?year=&month=&format=xlsx|gl-csv|...      -> payroll & statutory exports
export const GET = salaryRoute(async (request: NextRequest) => {
  await requireApiPermission(request, "salary_slips.view");
  await requireApiPermission(request, "employees.compensation.view");
  const params = request.nextUrl.searchParams;
  const year = Number(params.get("year"));

  if (params.get("listPeriods") === "1") {
    if (!isValidYear(year)) return badRequest("กรุณาเลือกปีให้ถูกต้อง");
    const periods = await listPayrollPeriods(year);
    return NextResponse.json({ year, periods }, { headers: { "Cache-Control": "no-store" } });
  }

  const month = Number(params.get("month"));
  if (!isValidPeriod(year, month)) return badRequest("กรุณาเลือกเดือนและปีให้ถูกต้อง");

  const format = params.get("format");
  if (!format) {
    const payroll = await createPayroll(year, month);
    return NextResponse.json(payroll, { headers: { "Cache-Control": "no-store" } });
  }

  await requireApiPermission(request, "salary_slips.export");
  const filterOptions = parseFilterOptions(params);
  const periodSlug = `${year}-${String(month).padStart(2, "0")}`;

  if (format === "kt20k-xlsx" || format === "pnd1k-xlsx") {
    const yearlyPayrolls = await Promise.all(
      Array.from({ length: 12 }, (_, idx) => createPayroll(year, idx + 1, { includePreviousComparison: false })),
    );
    const hasData = yearlyPayrolls.some((period) => filterAndSortPayrollRows(period.rows, filterOptions).length > 0);
    if (!hasData) return badRequest("ไม่พบข้อมูลพนักงานสำหรับออกรายงานประจำปี", 404);
    const workbook = format === "kt20k-xlsx"
      ? createKt20kWorkbook(yearlyPayrolls, filterOptions)
      : createPnd1kWorkbook(yearlyPayrolls, filterOptions);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const prefix = format === "kt20k-xlsx" ? "kt20k" : "pnd1k";
    return attachmentResponse(buffer, XLSX_CONTENT_TYPE, `${prefix}-${year}.xlsx`);
  }

  const payroll = await createPayroll(year, month);
  const targetRows = filterAndSortPayrollRows(payroll.rows, filterOptions);
  if (targetRows.length === 0) return badRequest("ไม่พบพนักงานในรอบเงินเดือนที่เลือก", 404);

  const incompleteMessage = describeIncompleteRows(targetRows);
  if (incompleteMessage) return badRequest(incompleteMessage, 409);

  const allowUnlocked = params.get("allowUnlocked") === "1";
  const isLocked = payroll.workflow.status === "locked" || payroll.workflow.status === "paid";

  switch (format) {
    case "xlsx": {
      const buffer = Buffer.from(await createPayrollWorkbook(payroll).xlsx.writeBuffer());
      return attachmentResponse(buffer, XLSX_CONTENT_TYPE, `payroll-${periodSlug}.xlsx`);
    }
    case "matrix-xlsx": {
      const buffer = Buffer.from(await createPayrollMatrixWorkbook(payroll).xlsx.writeBuffer());
      return attachmentResponse(buffer, XLSX_CONTENT_TYPE, `payroll-matrix-${periodSlug}.xlsx`);
    }
    case "summary-xlsx": {
      const buffer = Buffer.from(await createPayrollSummarySheetWorkbook(payroll, filterOptions).xlsx.writeBuffer());
      return attachmentResponse(buffer, XLSX_CONTENT_TYPE, `TJARUSCH_PAYROLL_${periodSlug}-01.xlsx`);
    }
    case "summary-pdf": {
      const buffer = await createPayrollSummarySheetPdf(payroll, filterOptions);
      return attachmentResponse(buffer, PDF_CONTENT_TYPE, `TJARUSCH_PAYROLL_${periodSlug}-01.pdf`);
    }
    case "gl-csv": {
      const buffer = createGlJournalCsv(payroll);
      return attachmentResponse(buffer, CSV_CONTENT_TYPE, `gl-journal-${periodSlug}.csv`);
    }
    case "bank-txt": {
      if (!isLocked && !allowUnlocked) return badRequest("กรุณาล็อกงวดเงินเดือนก่อนส่งออกไฟล์นี้", 409);
      const buffer = createBankTransferTxt(payroll, filterOptions);
      return attachmentResponse(buffer, TXT_CONTENT_TYPE, `bank-transfer-${periodSlug}.txt`);
    }
    case "bank-xlsx": {
      if (!isLocked && !allowUnlocked) return badRequest("กรุณาล็อกงวดเงินเดือนก่อนส่งออกไฟล์นี้", 409);
      const buffer = Buffer.from(await createBankTransferWorkbook(payroll, filterOptions).xlsx.writeBuffer());
      return attachmentResponse(buffer, XLSX_CONTENT_TYPE, `bank-transfer-${periodSlug}.xlsx`);
    }
    case "pnd1-xlsx": {
      if (!isLocked && !allowUnlocked) return badRequest("กรุณาล็อกงวดเงินเดือนก่อนส่งออกไฟล์นี้", 409);
      const buffer = Buffer.from(await createPnd1Workbook(payroll, filterOptions).xlsx.writeBuffer());
      return attachmentResponse(buffer, XLSX_CONTENT_TYPE, `pnd1-${periodSlug}.xlsx`);
    }
    case "sso-xlsx": {
      if (!isLocked && !allowUnlocked) return badRequest("กรุณาล็อกงวดเงินเดือนก่อนส่งออกไฟล์นี้", 409);
      const buffer = Buffer.from(await createSso110Workbook(payroll, filterOptions).xlsx.writeBuffer());
      return attachmentResponse(buffer, XLSX_CONTENT_TYPE, `sso-1-10-${periodSlug}.xlsx`);
    }
    default:
      return badRequest("รูปแบบไฟล์ส่งออกไม่ถูกต้อง");
  }
});
