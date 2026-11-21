import { NextRequest, NextResponse } from "next/server";
import { bufferToReadableStream } from "@/lib/api/stream";
import { requireApiPermission } from "@/lib/auth/dal";
import { createPayroll } from "@/lib/payroll/service";
import { describeIncompleteRows } from "@/lib/payroll/readiness";
import { createPayrollWorkbook } from "@/lib/payroll/workbook";
import { salaryRoute } from "@/app/api/salary-slips/_shared";

export const runtime = "nodejs";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isValidPeriod(year: number, month: number) {
  return Number.isInteger(year) && year >= 1900 && year <= 2200 && Number.isInteger(month) && month >= 1 && month <= 12;
}

// GET /api/payroll?year=&month=           -> payroll JSON for the period
// GET /api/payroll?year=&month=&format=xlsx -> Excel export (needs salary_slips.export and every row priced)
export const GET = salaryRoute(async (request: NextRequest) => {
  await requireApiPermission(request, "salary_slips.view");
  await requireApiPermission(request, "employees.compensation.view");
  const params = request.nextUrl.searchParams;
  const year = Number(params.get("year"));
  const month = Number(params.get("month"));
  if (!isValidPeriod(year, month)) return badRequest("กรุณาเลือกเดือนและปีให้ถูกต้อง");

  const payroll = await createPayroll(year, month);
  if (params.get("format") !== "xlsx") return NextResponse.json(payroll, { headers: { "Cache-Control": "no-store" } });

  await requireApiPermission(request, "salary_slips.export");
  if (payroll.rows.length === 0) return badRequest("ไม่พบพนักงานในรอบเงินเดือนที่เลือก", 404);
  const incompleteMessage = describeIncompleteRows(payroll.rows);
  if (incompleteMessage) return badRequest(incompleteMessage, 409);

  const buffer = Buffer.from(await createPayrollWorkbook(payroll).xlsx.writeBuffer());
  return new Response(bufferToReadableStream(buffer), { headers: {
    "Content-Type": XLSX_CONTENT_TYPE,
    "Content-Disposition": `attachment; filename="payroll-${year}-${String(month).padStart(2, "0")}.xlsx"`,
    "Content-Length": String(buffer.byteLength),
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
});
