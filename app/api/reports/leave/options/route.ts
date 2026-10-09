import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { getLeaveReportAccess, LeaveReportAccessError } from "@/lib/reports/leave/access";
import { getOwnLeaveReportEmployee, listLeaveReportEmployees, LeaveReportServiceError } from "@/lib/reports/leave/service";

export const runtime = "nodejs";

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  let access;
  try {
    access = getLeaveReportAccess(user.permissions, user.employeeId);
  } catch (error) {
    if (error instanceof LeaveReportAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  try {
    const employees = access.company
      ? await listLeaveReportEmployees()
      : [await getOwnLeaveReportEmployee(access.ownEmployeeId)].filter((employee) => employee !== null);
    if (!access.company && !employees.length) {
      return NextResponse.json({ error: "ไม่พบข้อมูลพนักงานในบัญชีนี้" }, { status: 403 });
    }
    return NextResponse.json({ employees, canViewCompany: access.company, maxSelectedEmployees: 100 }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof LeaveReportServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Leave report options lookup failed", error);
    return NextResponse.json({ error: "ไม่สามารถโหลดรายชื่อพนักงานได้ในขณะนี้" }, { status: 500 });
  }
});
