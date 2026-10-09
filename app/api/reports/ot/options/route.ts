import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { getOtReportAccess, OtReportAccessError } from "@/lib/reports/ot/access";
import { getOwnOtReportEmployee, listOtReportEmployees, OtReportServiceError } from "@/lib/reports/ot/service";

export const runtime = "nodejs";

export const GET = withApiAuth(async (_request: NextRequest) => {
  const user = await requireApiUser(_request);
  let access;
  try {
    access = getOtReportAccess(user.permissions, user.employeeId);
  } catch (error) {
    if (error instanceof OtReportAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  try {
    const employees = access.company
      ? await listOtReportEmployees()
      : [await getOwnOtReportEmployee(access.ownEmployeeId)].filter((item) => item !== null);
    if (!access.company && !employees.length) {
      return NextResponse.json({ error: "ไม่พบข้อมูลพนักงานในบัญชีนี้" }, { status: 403 });
    }
    return NextResponse.json({
      employees,
      canViewCompany: access.company,
      maxSelectedEmployees: 100,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OtReportServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("OT report options lookup failed", error);
    return NextResponse.json({ error: "ไม่สามารถโหลดรายชื่อพนักงานได้ในขณะนี้" }, { status: 500 });
  }
});
