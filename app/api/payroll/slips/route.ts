import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bufferToReadableStream } from "@/lib/api/stream";
import { requireApiPermission } from "@/lib/auth/dal";
import { describeIncompleteRows } from "@/lib/payroll/readiness";
import { createHrmPeriodSlips } from "@/lib/payroll/slips-bridge";
import { createExcel, createPdf } from "@/lib/salary-slips/documents";
import { salaryRoute } from "@/app/api/salary-slips/_shared";

export const runtime = "nodejs";

const slipsBodySchema = z.object({
  year: z.number().int().min(1900).max(2200),
  month: z.number().int().min(1).max(12),
  format: z.enum(["pdf", "xlsx"]),
  employeeIds: z.array(z.string().uuid()).min(1).max(2000).optional(),
});

export const POST = salaryRoute(async (request: NextRequest) => {
  await requireApiPermission(request, "salary_slips.view");
  await requireApiPermission(request, "employees.compensation.view");
  await requireApiPermission(request, "salary_slips.export");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูล JSON ไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = slipsBodySchema.parse(body);
  const { payroll, items } = await createHrmPeriodSlips(parsed.year, parsed.month, parsed.employeeIds);

  const selectedSet = parsed.employeeIds?.length ? new Set(parsed.employeeIds) : null;
  const targetRows = selectedSet
    ? payroll.rows.filter((row) => selectedSet.has(row.employeeId))
    : payroll.rows.filter((row) => !row.doNotPrintPayslip);

  if (targetRows.length === 0) {
    return NextResponse.json({ error: "ไม่พบพนักงานสำหรับออกสลิปในงวดที่เลือก" }, { status: 404 });
  }

  const incompleteMessage = describeIncompleteRows(targetRows);
  if (incompleteMessage) {
    return NextResponse.json({ error: incompleteMessage }, { status: 409 });
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "ไม่พบรายการสลิปที่พร้อมส่งออก" }, { status: 404 });
  }

  const buffer = parsed.format === "pdf" ? await createPdf(items) : await createExcel(items);
  const periodSlug = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;

  return new Response(bufferToReadableStream(buffer), {
    headers: {
      "Content-Type": parsed.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="hrm-salary-slips-${periodSlug}.${parsed.format}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
