import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { assertLeaveReportExportAccess, getLeaveReportAccess, LeaveReportAccessError } from "@/lib/reports/leave/access";
import { PdfRendererUnavailableError, renderLeaveReportPdf } from "@/lib/reports/pdf";
import { getLeaveReportDefinition, leaveReportExportSchema } from "@/lib/reports/leave/options";
import { createLeaveReportModel, LeaveReportServiceError } from "@/lib/reports/leave/service";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 64 * 1024;

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) return NextResponse.json({ error: "คำขอมีขนาดใหญ่เกินไป" }, { status: 413 });

  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BYTES) return NextResponse.json({ error: "คำขอมีขนาดใหญ่เกินไป" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = leaveReportExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: "ข้อมูลรายงานไม่ถูกต้อง",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, { status: 400 });
  }

  const definition = getLeaveReportDefinition(parsed.data.variant)!;
  let access;
  try {
    access = getLeaveReportAccess(user.permissions, user.employeeId);
    assertLeaveReportExportAccess(access, definition, parsed.data.employeeIds);
  } catch (error) {
    if (error instanceof LeaveReportAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  try {
    const model = await createLeaveReportModel(parsed.data, access.company ? "company" : "own", access.ownEmployeeId);
    const pdf = await renderLeaveReportPdf({ variant: parsed.data.variant, model, sortRules: parsed.data.sortRules });
    const monthPart = parsed.data.month === undefined ? "" : `-${String(parsed.data.month).padStart(2, "0")}`;
    const filename = `leave-report-${parsed.data.variant}-${parsed.data.year}${monthPart}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof LeaveReportServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PdfRendererUnavailableError) {
      return NextResponse.json({ error: "ยังไม่ได้ติดตั้ง Chromium สำหรับสร้าง PDF กรุณาติดตั้งด้วยคำสั่ง npx playwright install chromium" }, { status: 503 });
    }
    console.error("Leave report PDF generation failed", error);
    return NextResponse.json({ error: "ไม่สามารถสร้างไฟล์รายงานได้ในขณะนี้" }, { status: 500 });
  }
});
