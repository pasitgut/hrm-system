import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createSessionToken, COOKIE_NAME } from "@/lib/auth/session";
import { createDefaultEmployeePayrollData } from "@/lib/employees/payroll-data";
import { createEmployee, createLeaveRequest, createOvertimeRequest, createUser } from "@/tests/setup/factories";
import { closeDb, resetDb } from "@/tests/setup/db";
import { GET } from "./route";

const permissions = ["salary_slips.view", "employees.compensation.view", "salary_slips.export"];

beforeEach(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!/test$/.test(url.pathname) || !["localhost", "127.0.0.1", "postgres"].includes(url.hostname)) throw new Error("Payroll integration tests require a local test database");
  await resetDb();
});

afterAll(async () => closeDb());

async function session(permissionSet = permissions, employeeId?: string) {
  const { user, employee } = await createUser({ permissions: permissionSet, ...(employeeId ? { employeeId } : {}) });
  const token = await createSessionToken({ sub: user.id, employeeId: employeeId ?? employee!.id, email: user.email, role: user.role, permissions: permissionSet });
  return token;
}

function request(query = "", token?: string) {
  return GET(new NextRequest(`http://localhost/api/payroll${query}`, {
    headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : {},
  }));
}

describe("GET /api/payroll", () => {
  it("counts OT by calendar month: the 1st and last day are in, the neighbouring months are out", async () => {
    const employee = await createEmployee({ baseSalary: 30000, weeklyHolidays: [] });
    const token = await session(permissions, employee.id);
    const approved = (startAt: string, endAt: string) =>
      createOvertimeRequest({ employeeId: employee.id, statusCode: "approved", startAt: new Date(startAt), endAt: new Date(endAt) });
    await approved("2026-08-26T11:00:00Z", "2026-08-26T12:00:00Z"); // 26 Aug 18:00 BKK: previous month
    await approved("2026-08-31T17:30:00Z", "2026-08-31T18:30:00Z"); // 1 Sep 00:30 BKK: first day of the month
    await approved("2026-09-30T11:00:00Z", "2026-09-30T13:00:00Z"); // 30 Sep 18:00 BKK: last day of the month
    await approved("2026-10-01T11:00:00Z", "2026-10-01T12:00:00Z"); // 1 Oct 18:00 BKK: next month

    const payload = await (await request("?year=2026&month=9", token)).json();
    const row = payload.rows.find((item: { employeeId: string }) => item.employeeId === employee.id);

    expect(row.weekdayOtHours + row.holidayOtHours).toBe(3);
  });

  it("calculates salary and approved OT from internal data and exports a month-specific workbook", async () => {
    const payrollData = createDefaultEmployeePayrollData();
    payrollData.incomeItems = [{ code: "housing", label: "ค่าที่พัก", amount: 500, unit: "period", enabled: true }];
    payrollData.deductionItems = [{ code: "loan", label: "เงินกู้", amount: 100, unit: "period", enabled: true }];
    const employee = await createEmployee({ baseSalary: 30000, payrollData, weeklyHolidays: [6] });
    const token = await session(permissions, employee.id);
    await createOvertimeRequest({ employeeId: employee.id, statusCode: "approved", startAt: new Date("2026-09-10T11:00:00Z"), endAt: new Date("2026-09-10T13:00:00Z") });
    await createOvertimeRequest({ employeeId: employee.id, statusCode: "approved", startAt: new Date("2026-09-12T11:00:00Z"), endAt: new Date("2026-09-12T12:00:00Z") });
    await createOvertimeRequest({ employeeId: employee.id, statusCode: "pending", startAt: new Date("2026-09-13T11:00:00Z"), endAt: new Date("2026-09-13T12:00:00Z") });
    await createLeaveRequest({ employeeId: employee.id, statusCode: "approved", startOn: "2026-09-15", endOn: "2026-09-15" });

    const response = await request("?year=2026&month=9", token);
    expect(response.status).toBe(200);
    const payload = await response.json();
    const row = payload.rows.find((item: { employeeId: string }) => item.employeeId === employee.id);
    expect(payload.periodStart).toBe("2026-09-01");
    expect(payload.periodEnd).toBe("2026-09-30");
    expect(row).toMatchObject({
      baseSalary: 30000,
      weekdayOtHours: 2,
      holidayOtHours: 1,
      pendingOtHours: 1,
      pendingOtRequests: 1,
      approvedLeaveRequests: 1,
      otAmount: 750,
      socialSecurityAmount: 875,
      employerSocialSecurity: 875,
      incomeTotal: 31250,
      deductionTotal: 975,
      netPay: 30275,
    });

    const exported = await request("?year=2026&month=9&format=xlsx", token);
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(exported.headers.get("content-disposition")).toContain("payroll-2026-09.xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()) as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["สรุปเงินเดือน", "รายการรายรับรายหัก", "วันลาที่อนุมัติ"]);
    expect(workbook.getWorksheet("สรุปเงินเดือน")!.getCell("A2").value).toBe("รหัสพนักงาน");
    const summarySheet = workbook.getWorksheet("สรุปเงินเดือน")!;
    const netPayColumn = (summarySheet.getRow(2).values as unknown[]).indexOf("รับสุทธิ"); // looked up by header, not position
    expect(netPayColumn).toBeGreaterThan(0);
    expect(summarySheet.getCell(3, netPayColumn).value).toBe(30275);
    expect(workbook.getWorksheet("รายการรายรับรายหัก")!.getCell("D3").value).toBe("เงินเดือน");
    expect(workbook.getWorksheet("วันลาที่อนุมัติ")!.getCell("C3").value).toBe("ลาป่วย");

    const summaryPdf = await request("?year=2026&month=9&format=summary-pdf", token);
    expect(summaryPdf.status).toBe(200);
    expect(summaryPdf.headers.get("content-type")).toContain("application/pdf");
    expect(summaryPdf.headers.get("content-disposition")).toContain("TJARUSCH_PAYROLL_2026-09-01.pdf");

    const summaryXlsx = await request("?year=2026&month=9&format=summary-xlsx", token);
    expect(summaryXlsx.status).toBe(200);
    expect(summaryXlsx.headers.get("content-disposition")).toContain("TJARUSCH_PAYROLL_2026-09-01.xlsx");
  });

  it("blocks export when configured pay items need an unavailable quantity", async () => {
    const payrollData = createDefaultEmployeePayrollData();
    payrollData.incomeItems = [{ code: "day-rate", label: "ค่าแรงรายวัน", amount: 700, unit: "day", enabled: true }];
    const employee = await createEmployee({ baseSalary: 20000, payrollData });
    const token = await session(permissions, employee.id);

    const preview = await request("?year=2026&month=9", token);
    const payload = await preview.json();
    expect(payload.rows.find((row: { employeeId: string }) => row.employeeId === employee.id).netPay).toBeNull();

    const exported = await request("?year=2026&month=9&format=xlsx", token);
    expect(exported.status).toBe(409);
    expect((await exported.json()).error).toContain("ค่าแรงรายวัน");
  });

  it("enforces authentication and payroll compensation permissions", async () => {
    expect((await request("?year=2026&month=9")).status).toBe(401);
    const token = await session(["salary_slips.view"]);
    expect((await request("?year=2026&month=9", token)).status).toBe(403);
  });
});
