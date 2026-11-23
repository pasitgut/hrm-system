import { describe, expect, it } from "vitest";
import { createDefaultEmployeePayrollData } from "@/lib/employees/payroll-data";
import {
  buildPayrollRow,
  isIncentiveIncome,
  isProvidentFundDeduction,
  isSocialSecurityDeduction,
  isTaxDeduction,
  summarizePayroll,
} from "./calculate";
import type { PayrollEmployeeInput } from "./inputs";

function makeEmployee(overrides: Partial<PayrollEmployeeInput> = {}): PayrollEmployeeInput {
  const payrollData = createDefaultEmployeePayrollData();
  payrollData.bankName = "KBANK";
  payrollData.accountNumber = "1234567890";

  return {
    employeeId: "11111111-1111-1111-1111-111111111111",
    code: "0001",
    prefix: "นางสาว",
    firstName: "วิภาวดี",
    lastName: "ศรีสุข",
    citizenId: "1100500123456",
    avatarUrl: null,
    startDate: "2024-01-01",
    endDate: null,
    department: "บัญชี",
    baseSalary: 38000,
    payrollData,
    weekdayMultiplier: 1.5,
    holidayMultiplier: 3,
    workHoursPerDay: 8,
    weeklyHolidays: [0, 6],
    ...overrides,
  };
}

describe("payroll classifiers and calculation", () => {
  it("classifies tax, SSO, provident fund, and incentives accurately", () => {
    expect(isTaxDeduction("SYS002", "ภาษี")).toBe(true);
    expect(isTaxDeduction("DDT009", "กองทุนกู้ยืม")).toBe(false);
    expect(isSocialSecurityDeduction("SYS001", "ประกันสังคม")).toBe(true);
    expect(isSocialSecurityDeduction("SSO", "ปกส.")).toBe(true);
    expect(isProvidentFundDeduction("DDT006", "กองทุนสำรองเลี้ยงชีพ")).toBe(true);
    expect(isIncentiveIncome("INT1801001", "โบนัส")).toBe(true);
    expect(isIncentiveIncome("INT19", "ค่าที่พักอาศัย")).toBe(false);
  });

  it("splits income and deduction categories and detects warning & verification states", () => {
    const payrollData = createDefaultEmployeePayrollData();
    payrollData.bankName = "KBANK";
    payrollData.accountNumber = ""; // triggers missing_bank warning
    payrollData.incomeItems = [
      { code: "INT003", label: "เบี้ยขยัน", amount: 1500, unit: "period", enabled: true },
      { code: "INT19", label: "ค่าที่พักอาศัย", amount: 2000, unit: "period", enabled: true },
    ];
    payrollData.deductionItems = [
      { code: "SYS002", label: "ภาษี", amount: 1063, unit: "period", enabled: true },
      { code: "SYS001", label: "ประกันสังคม", amount: 750, unit: "period", enabled: true },
      { code: "DDT006", label: "กองทุนสำรองเลี้ยงชีพ", amount: 1900, unit: "period", enabled: true },
    ];

    const employee = makeEmployee({
      baseSalary: 38000,
      startDate: "2026-09-05",
      payrollData,
    });

    const unverifiedRow = buildPayrollRow(
      employee,
      { weekday: 2, holiday: 0, pending: 1, pendingCount: 1 },
      [],
      { periodStart: "2026-09-01", periodEnd: "2026-09-30" },
    );

    expect(unverifiedRow.incentiveIncomeTotal).toBe(1500);
    expect(unverifiedRow.allowanceIncomeTotal).toBe(2000);
    expect(unverifiedRow.otherIncomeTotal).toBe(3500);
    expect(unverifiedRow.taxAmount).toBe(1063);
    expect(unverifiedRow.socialSecurityAmount).toBe(750);
    expect(unverifiedRow.providentFundAmount).toBe(1900);
    expect(unverifiedRow.otherDeductionsAmount).toBe(1900);
    expect(unverifiedRow.employerSocialSecurity).toBe(750);
    expect(unverifiedRow.isNewHire).toBe(true);
    expect(unverifiedRow.hasBlockingIssue).toBe(false);
    expect(unverifiedRow.needsReview).toBe(true);
    expect(unverifiedRow.reviewIssues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["pending_ot", "missing_bank", "mid_period_change"]),
    );

    const verifiedRow = buildPayrollRow(
      employee,
      { weekday: 2, holiday: 0, pending: 1, pendingCount: 1 },
      [],
      {
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        verifiedEmployeeIds: new Set([employee.employeeId]),
      },
    );

    expect(verifiedRow.isVerified).toBe(true);
    expect(verifiedRow.needsReview).toBe(false);
  });

  it("refuses verification override when a blocking issue exists and computes summary metrics", () => {
    const missingSalaryEmp = makeEmployee({
      employeeId: "22222222-2222-2222-2222-222222222222",
      code: "0002",
      baseSalary: null,
    });
    const blockingRow = buildPayrollRow(missingSalaryEmp, undefined, [], {
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      verifiedEmployeeIds: new Set([missingSalaryEmp.employeeId]),
    });

    expect(blockingRow.hasBlockingIssue).toBe(true);
    expect(blockingRow.isVerified).toBe(false);
    expect(blockingRow.needsReview).toBe(true);
    expect(blockingRow.netPay).toBeNull();

    const readyPayrollData = createDefaultEmployeePayrollData();
    readyPayrollData.bankName = "KBANK";
    readyPayrollData.accountNumber = "1112223334";
    readyPayrollData.incomeItems = [{ code: "INT19", label: "ค่าที่พัก", amount: 2000, unit: "period", enabled: true }];
    readyPayrollData.deductionItems = [
      { code: "SYS002", label: "ภาษี", amount: 500, unit: "period", enabled: true },
      { code: "SYS001", label: "ประกันสังคม", amount: 750, unit: "period", enabled: true },
    ];
    const readyRow = buildPayrollRow(
      makeEmployee({ baseSalary: 30000, payrollData: readyPayrollData }),
      undefined,
      [],
      { periodStart: "2026-09-01", periodEnd: "2026-09-30" },
    );

    const summary = summarizePayroll([readyRow, blockingRow], 25000);
    expect(summary.employeeCount).toBe(2);
    expect(summary.grossTotal).toBe(32000);
    expect(summary.grossChangePercent).toBe(28);
    expect(summary.taxAndSsoTotal).toBe(1250);
    expect(summary.employerSocialSecurityTotal).toBe(750);
    expect(summary.netTotal).toBe(30750);
    expect(summary.blockingCount).toBe(1);
    expect(summary.reviewCount).toBe(1);
    expect(summary.costBreakdown.total).toBe(32750);
  });

  it("applies per-period employee overrides and resolves day-unit items via workingDays", () => {
    const payrollData = createDefaultEmployeePayrollData();
    payrollData.bankName = "KBANK";
    payrollData.accountNumber = "1112223334";
    payrollData.incomeItems = [
      { code: "DAY_ALLOW", label: "เบี้ยเลี้ยงรายวัน", amount: 200, unit: "day", enabled: true },
    ];
    payrollData.deductionItems = [
      { code: "SYS001", label: "ประกันสังคม", amount: 750, unit: "period", enabled: true },
    ];

    const emp = makeEmployee({ baseSalary: 20000, payrollData });
    const unpriced = buildPayrollRow(emp, undefined, [], { periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(unpriced.hasBlockingIssue).toBe(true);
    expect(unpriced.netPay).toBeNull();

    const overridden = buildPayrollRow(emp, undefined, [], {
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      employeeOverride: {
        workingDays: 22,
        incomes: { INT003: 1500 },
        deductions: { SYS002: 300 },
      },
    });
    expect(overridden.hasBlockingIssue).toBe(false);
    expect(overridden.hasPeriodOverride).toBe(true);
    expect(overridden.workingDays).toBe(22);
    expect(overridden.incomeBreakdown.INT001).toBe(20000);
    expect(overridden.incomeBreakdown.INT003).toBe(1500);
    expect(overridden.deductionBreakdown.SYS001).toBe(750);
    expect(overridden.deductionBreakdown.SYS002).toBe(300);
    expect(overridden.incomeTotal).toBe(20000 + 1500 + 4400);
    expect(overridden.deductionTotal).toBe(1050);
    expect(overridden.netPay).toBe(24850);
  });

  it("auto-calculates Thai Section 33 SSO according to 2026+ statutory tiers and custom rate rules", () => {
    const emp25k = makeEmployee({ baseSalary: 25000 });
    const emp15750 = makeEmployee({ baseSalary: 15750 });
    const emp10k = makeEmployee({ baseSalary: 10000 });
    const empZero = makeEmployee({ baseSalary: 0 });

    // 2026 (Phase 1: 5%, max base 17,500 => max 875)
    expect(buildPayrollRow(emp25k, undefined, [], { periodStart: "2026-09-01", periodEnd: "2026-09-30" }).socialSecurityAmount).toBe(875);
    expect(buildPayrollRow(emp15750, undefined, [], { periodStart: "2026-09-01", periodEnd: "2026-09-30" }).socialSecurityAmount).toBe(788);
    expect(buildPayrollRow(emp10k, undefined, [], { periodStart: "2026-09-01", periodEnd: "2026-09-30" }).socialSecurityAmount).toBe(500);
    expect(buildPayrollRow(empZero, undefined, [], { periodStart: "2026-09-01", periodEnd: "2026-09-30" }).socialSecurityAmount).toBe(0);

    // Historical & future statutory step-ups
    expect(buildPayrollRow(emp25k, undefined, [], { periodStart: "2025-12-01", periodEnd: "2025-12-31" }).socialSecurityAmount).toBe(750);
    expect(buildPayrollRow(emp25k, undefined, [], { periodStart: "2029-01-01", periodEnd: "2029-01-31" }).socialSecurityAmount).toBe(1000);
    expect(buildPayrollRow(emp25k, undefined, [], { periodStart: "2032-01-01", periodEnd: "2032-01-31" }).socialSecurityAmount).toBe(1150);

    // Custom admin-configured rate rule (e.g. asymmetric employee/employer rate)
    const customRow = buildPayrollRow(emp25k, undefined, [], {
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      socialSecurityRule: {
        effectiveFrom: "2026-09-01",
        label: "ลดอัตราชั่วคราว",
        employeeRatePercent: 3,
        employerRatePercent: 4,
        minWageBase: 1650,
        maxWageBase: 20000,
      },
    });
    expect(customRow.socialSecurityAmount).toBe(600);
    expect(customRow.employerSocialSecurity).toBe(800);

    // Opt-out employee (e.g. executive/director not enrolled in Section 33)
    const optOutData = createDefaultEmployeePayrollData();
    optOutData.socialSecurityEnabled = false;
    const execEmp = makeEmployee({ baseSalary: 40000, payrollData: optOutData });
    const execRow = buildPayrollRow(execEmp, undefined, [], { periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(execRow.socialSecurityAmount).toBe(0);
    expect(execRow.employerSocialSecurity).toBe(0);
  });
});
