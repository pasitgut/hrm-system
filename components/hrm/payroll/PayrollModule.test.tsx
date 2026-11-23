// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PayrollModule from "@/components/hrm/payroll/PayrollModule";

function makePayrollPayload(overrides: Record<string, unknown> = {}) {
  const row1 = {
    employeeId: "11111111-1111-1111-1111-111111111111",
    code: "0001",
    name: "วิภาวดี ศรีสุข",
    prefix: "นางสาว",
    firstName: "วิภาวดี",
    lastName: "ศรีสุข",
    citizenId: "1100500111222",
    avatarUrl: null,
    department: "บัญชี",
    bankName: "KBANK",
    bankAccount: "1234567890",
    startDate: "2024-01-01",
    endDate: null,
    isNewHire: false,
    isOffboarded: false,
    taxCondition: "withhold",
    doNotPrintPayslip: false,
    baseSalary: 38000,
    workHoursPerDay: 8,
    incomes: [
      { label: "เงินเดือน", amount: 38000 },
      { label: "ค่าที่พัก", amount: 1500 },
    ],
    deductions: [
      { label: "ภาษี", amount: 1063 },
      { label: "ประกันสังคม", amount: 750 },
      { label: "กองทุนสำรองเลี้ยงชีพ", amount: 1900 },
    ],
    incomeBreakdown: {
      INT001: 38000,
      INT002: 0,
      INT003: 0,
      INT008: 0,
      INT1801001: 0,
      INT19: 1500,
      license: 0,
      Tel: 0,
    },
    deductionBreakdown: {
      DDT003: 0,
      DDT004: 0,
      DDT005: 0,
      DDT006: 1900,
      DDT009: 0,
      SYSWELFARE: 0,
      SYS001: 750,
      SYS002: 1063,
    },
    workingDays: null,
    dailyRate: 0,
    dailyWageTotal: 0,
    hasPeriodOverride: false,
    unpricedItems: [],
    weekdayOtHours: 0,
    holidayOtHours: 0,
    pendingOtHours: 0,
    pendingOtRequests: 0,
    ot1xAmount: 0,
    weekdayOtAmount: 0,
    holidayOtAmount: 0,
    otAmount: 0,
    paymentMethod: "transfer",
    remark: "",
    otherIncomeTotal: 1500,
    incentiveIncomeTotal: 0,
    allowanceIncomeTotal: 1500,
    taxAmount: 1063,
    socialSecurityAmount: 750,
    providentFundAmount: 1900,
    otherDeductionsAmount: 1900,
    employerSocialSecurity: 750,
    approvedLeaveRequests: 0,
    approvedLeaves: [],
    incomeTotal: 39500,
    deductionTotal: 3713,
    netPay: 35787,
    reviewIssues: [],
    hasBlockingIssue: false,
    isVerified: false,
    needsReview: false,
  };

  const row2 = {
    ...row1,
    employeeId: "22222222-2222-2222-2222-222222222222",
    code: "0002",
    name: "ธนากร มั่นคง",
    firstName: "ธนากร",
    lastName: "มั่นคง",
    department: "ผลิต",
    bankAccount: "",
    baseSalary: 18500,
    incomes: [
      { label: "เงินเดือน", amount: 18500 },
      { label: "ค่าล่วงเวลา (OT)", amount: 6240 },
    ],
    deductions: [
      { label: "ภาษี", amount: 365 },
      { label: "ประกันสังคม", amount: 750 },
    ],
    incomeBreakdown: {
      INT001: 18500,
      INT002: 6240,
      INT003: 0,
      INT008: 0,
      INT1801001: 0,
      INT19: 0,
      license: 0,
      Tel: 0,
    },
    deductionBreakdown: {
      DDT003: 0,
      DDT004: 0,
      DDT005: 0,
      DDT006: 0,
      DDT009: 0,
      SYSWELFARE: 0,
      SYS001: 750,
      SYS002: 365,
    },
    workingDays: null,
    dailyRate: 0,
    dailyWageTotal: 0,
    hasPeriodOverride: false,
    weekdayOtHours: 16,
    pendingOtHours: 2,
    pendingOtRequests: 1,
    ot1xAmount: 0,
    weekdayOtAmount: 6240,
    holidayOtAmount: 0,
    otAmount: 6240,
    paymentMethod: "cash",
    remark: "เงินสด",
    otherIncomeTotal: 0,
    allowanceIncomeTotal: 0,
    taxAmount: 365,
    providentFundAmount: 0,
    otherDeductionsAmount: 0,
    incomeTotal: 24740,
    deductionTotal: 1115,
    netPay: 23625,
    reviewIssues: [
      { code: "pending_ot", severity: "warning", message: "มีคำขอ OT รออนุมัติ 1 รายการ (2 ชม.)" },
      { code: "missing_bank", severity: "warning", message: "ยังไม่มีเลขที่บัญชีธนาคาร" },
    ],
    needsReview: true,
  };

  return {
    year: 2026,
    month: 9,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    payDate: "2026-09-30",
    companyName: "บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด",
    rows: [row1, row2],
    summary: {
      employeeCount: 2,
      newHireCount: 0,
      offboardedCount: 0,
      grossTotal: 64240,
      previousGrossTotal: 60000,
      grossChangePercent: 7.1,
      taxTotal: 1428,
      socialSecurityTotal: 1500,
      employerSocialSecurityTotal: 1500,
      providentFundTotal: 1900,
      taxAndSsoTotal: 2928,
      otherDeductionsTotal: 1900,
      deductionTotal: 4828,
      netTotal: 59412,
      reviewCount: 1,
      blockingCount: 0,
      verifiedCount: 0,
      pendingOtRequestCount: 1,
      costBreakdown: {
        baseSalary: 56500,
        overtime: 6240,
        incentives: 0,
        allowances: 1500,
        employerContributions: 1500,
        total: 65740,
      },
    },
    workflow: {
      status: "review",
      verifiedEmployeeIds: [],
      hasSnapshot: false,
      overrides: {},
      settings: {},
      submittedByName: null,
      submittedAt: null,
      approvedByName: null,
      approvedAt: null,
      lockedByName: null,
      lockedAt: null,
      paidByName: null,
      paidAt: null,
      note: null,
    },
    ...overrides,
  };
}

function activateTab(tabMatcher: RegExp) {
  const tab = screen.getByRole("tab", { name: tabMatcher });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PayrollModule (HRM-linked dashboard & separate salary slip tab)", () => {
  it("loads /api/payroll, renders stepper/KPIs/table/donut/exports, supports review filter & verify workflow", async () => {
    const initialPayroll = makePayrollPayload();
    const verifiedPayroll = makePayrollPayload({
      rows: [
        initialPayroll.rows[0],
        { ...initialPayroll.rows[1], isVerified: true, needsReview: false },
      ],
      summary: {
        ...initialPayroll.summary,
        reviewCount: 0,
        verifiedCount: 1,
      },
      workflow: {
        ...initialPayroll.workflow,
        verifiedEmployeeIds: [initialPayroll.rows[1].employeeId],
      },
    });

    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/payroll/workflow") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => verifiedPayroll,
        });
      }
      if (url.startsWith("/api/payroll?")) {
        return Promise.resolve({
          ok: true,
          json: async () => initialPayroll,
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PayrollModule permissions={["salary_slips.view", "employees.compensation.view", "salary_slips.export"]} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/payroll\?year=/), expect.anything()));
    expect(screen.getByText("รวบรวมข้อมูล")).toBeInTheDocument();
    expect(screen.getByText("พนักงานในงวด")).toBeInTheDocument();
    expect(screen.getByText("รวมเงินได้ (Gross)")).toBeInTheDocument();
    expect(screen.getByText("ภาษี + ประกันสังคม")).toBeInTheDocument();
    expect(screen.getByText("จ่ายสุทธิ (Net)")).toBeInTheDocument();
    expect(screen.getByText("รายการต้องตรวจสอบ")).toBeInTheDocument();
    expect(screen.getByText("โครงสร้างต้นทุน (บาท)")).toBeInTheDocument();
    expect(screen.getByText("ใบสรุปจ่ายเงินเดือน (TJARUSCH)")).toBeInTheDocument();
    expect(screen.getByText("Payroll Register (XLSX)")).toBeInTheDocument();

    expect(await screen.findByText("วิภาวดี ศรีสุข")).toBeInTheDocument();
    expect(screen.getByText("ธนากร มั่นคง")).toBeInTheDocument();

    // Filter to only items needing review
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByText("วิภาวดี ศรีสุข")).not.toBeInTheDocument();
    expect(screen.getByText("ธนากร มั่นคง")).toBeInTheDocument();

    // Open row detail dialog & verify employee
    fireEvent.click(screen.getByRole("button", { name: "ตรวจสอบ" }));
    expect(await screen.findByText("มีคำขอ OT รออนุมัติ 1 รายการ (2 ชม.)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันตรวจสอบแล้ว" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/payroll/workflow",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"toggle_verify"'),
        }),
      ),
    );
    expect(await screen.findByText("ยืนยันแล้ว")).toBeInTheDocument();
  });

  it("switches to ออกสลิปเงินเดือน tab and supports both HRM-linked slips and Excel upload preview", async () => {
    const initialPayroll = makePayrollPayload();
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/payroll/slips")) {
        return Promise.resolve({
          ok: true,
          blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        });
      }
      if (url === "/api/salary-slips/parse") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            rows: [
              {
                key: "file.xlsx::0001::2026-10",
                file: "payroll-oct.xlsx",
                sheet: "Sheet1",
                row: 2,
                data: {
                  code: "0001",
                  name: "ทดสอบ พนักงาน",
                  department: "บัญชี",
                  year: 2026,
                  month: 10,
                  bank: "KBANK",
                  bankAccount: "1234567890",
                  incomes: { salary: 2500000 },
                  deductions: { social_security: 75000 },
                  incomeTotal: 2500000,
                  deductionTotal: 75000,
                  netPay: 2425000,
                },
                errors: [],
                warnings: [],
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => initialPayroll,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => "blob:mock-url");
    } else {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    }

    render(<PayrollModule permissions={["salary_slips.view", "employees.compensation.view", "salary_slips.export"]} />);
    expect(await screen.findByText("วิภาวดี ศรีสุข")).toBeInTheDocument();

    activateTab(/ออกสลิปเงินเดือน/);

    // HRM-linked slips mode is active by default
    expect(await screen.findByRole("button", { name: "ออกสลิป PDF (2)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ออกสลิป PDF (2)" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/payroll/slips",
        expect.objectContaining({ method: "POST" }),
      ),
    );

    // Switch to Excel import mode
    fireEvent.click(screen.getByRole("button", { name: "นำเข้าไฟล์ Excel (.xlsx)" }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    const excelFile = new File(["dummy"], "payroll-oct.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    fireEvent.change(fileInput, { target: { files: [excelFile] } });

    fireEvent.click(screen.getByRole("button", { name: "ตรวจสอบไฟล์ก่อนออกสลิป" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/salary-slips/parse", expect.anything()));
    expect(await screen.findByText("ทดสอบ พนักงาน")).toBeInTheDocument();
  });

  it("supports 16-column sheet editing, periods tab, and statutory reports tab", async () => {
    const initialPayroll = makePayrollPayload();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("listPeriods=1")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            year: 2026,
            periods: [
              {
                year: 2026,
                month: 9,
                periodCode: "2026-09-01",
                periodStart: "2026-09-01",
                periodEnd: "2026-09-30",
                payDate: "2026-09-30",
                leaveCutoffDate: "2026-09-30",
                otCutoffDate: "2026-09-30",
                status: "open",
                workflowStatus: "review",
                groupName: "บัญชีเงินเดือน",
                includeMonthly: true,
                includeDaily: true,
                employeeCount: 2,
                overrideCount: 0,
                netTotal: null,
                lockedAt: null,
                lockedByName: null,
              },
            ],
          }),
        });
      }
      if (url.startsWith("/api/payroll/workflow") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => initialPayroll,
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => initialPayroll,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PayrollModule permissions={["salary_slips.view", "employees.compensation.view", "salary_slips.export"]} />);
    expect(await screen.findByText("วิภาวดี ศรีสุข")).toBeInTheDocument();

    // Tab 2: 16-column payroll sheet & employee override dialog
    activateTab(/ตารางคำนวณรายงวด/);
    expect(await screen.findByText("Count: 2")).toBeInTheDocument();
    const editButtons = screen.getAllByRole("button", { name: "แก้ไข" });
    fireEvent.click(editButtons[0]);

    expect(await screen.findByText("พนักงาน (0001 : วิภาวดี ศรีสุข)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/payroll/workflow",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"save_employee_override"'),
        }),
      ),
    );

    // Tab 3: Period management list
    activateTab(/จัดการงวดเงินเดือน/);
    expect(await screen.findByText("2026-09-01")).toBeInTheDocument();

    // Tab 5: Statutory reports (สปส.1-10 / ภ.ง.ด.1 / กท.20 ก)
    activateTab(/รายงานภาษี & สปส\./);
    expect(await screen.findByRole("heading", { name: "รายการแสดงนำส่งเงินสมทบ [สปส.1-10]" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export Excel" })).toBeInTheDocument();
  });
});
