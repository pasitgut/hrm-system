import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { assertOtReportExportAccess, getOtReportAccess, OtReportAccessError } from "@/lib/reports/ot/access";
import { loadReportFonts } from "@/lib/reports/font-assets";
import { createOtReportMarkup } from "@/lib/reports/ot/template";
import { getOtReportDefinition, otReportExportSchema } from "@/lib/reports/ot/options";
import { createOtReportModel, OtReportServiceError } from "@/lib/reports/ot/service";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 64 * 1024;

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "คำขอมีขนาดใหญ่เกินไป" }, { status: 413 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "คำขอมีขนาดใหญ่เกินไป" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = otReportExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: "ข้อมูลรายงานไม่ถูกต้อง",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    }, { status: 400 });
  }

  const definition = getOtReportDefinition(parsed.data.variant)!;
  let access;
  try {
    access = getOtReportAccess(user.permissions, user.employeeId);
    assertOtReportExportAccess(access, definition, parsed.data.employeeIds);
  } catch (error) {
    if (error instanceof OtReportAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  try {
    const model = await createOtReportModel(parsed.data, access.company ? "company" : "own", access.ownEmployeeId);
    const fonts = await loadReportFonts();
    const markup = createOtReportMarkup({ variant: parsed.data.variant, model, sortRules: parsed.data.sortRules }, fonts.regular, fonts.bold);
    const monthPart = parsed.data.month === undefined ? "" : `-${String(parsed.data.month).padStart(2, "0")}`;
    const filename = `ot-report-${parsed.data.variant}-${parsed.data.year}${monthPart}.pdf`;
    return NextResponse.json({ ...markup, filename }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof OtReportServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("OT report markup generation failed", error);
    return NextResponse.json({ error: "ไม่สามารถสร้างไฟล์รายงานได้ในขณะนี้" }, { status: 500 });
  }
});
