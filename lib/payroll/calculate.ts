import { normalizeEmployeePayrollData } from "@/lib/employees/payroll-data";
import { deriveOvertimeType } from "@/lib/ot/overtime-type";
import { durationHours, round2 } from "@/app/api/ot/_shared";
import {
  calculateSocialSecurityContribution,
  resolveSocialSecurityRuleForDate,
  type SocialSecurityRateRule,
} from "@/lib/settings/socialSecuritySettings";
import type { PayrollEmployeeInput, PayrollLeaveInput, PayrollOvertimeInput } from "./inputs";
import {
  STANDARD_DEDUCTION_COLUMNS,
  STANDARD_INCOME_COLUMNS,
  type PayrollEmployeeOverride,
  type PayrollLeaveLine,
  type PayrollLine,
  type PayrollReviewIssue,
  type PayrollRow,
  type PayrollSummary,
} from "./types";

// Pure calculation: no database, no HTTP. Pay rate = salary / 30 days / working hours per day.

type OvertimeTotals = { weekday: number; holiday: number; pending: number; pendingCount: number };
const NO_OVERTIME: OvertimeTotals = { weekday: 0, holiday: 0, pending: 0, pendingCount: 0 };

const INCENTIVE_CODES = new Set(["INT003", "INT008", "INT1801001", "attendance_bonus", "compensation", "bonus"]);
const TAX_CODES = new Set(["SYS002", "tax"]);
const SSO_CODES = new Set(["SYS001", "SSO", "social_security"]);
const PROVIDENT_FUND_CODES = new Set(["DDT006", "provident_fund"]);

const STANDARD_INCOME_CODE_MAP: Record<string, string> = {
  INT001: "INT001",
  salary: "INT001",
  INT002: "INT002",
  ot: "INT002",
  INT003: "INT003",
  attendance_bonus: "INT003",
  INT008: "INT008",
  compensation: "INT008",
  INT1801001: "INT1801001",
  bonus: "INT1801001",
  INT19: "INT19",
  housing: "INT19",
  license: "license",
  Tel: "Tel",
  phone: "Tel",
};

const STANDARD_DEDUCTION_CODE_MAP: Record<string, string> = {
  DDT003: "DDT003",
  leave: "DDT003",
  DDT004: "DDT004",
  late: "DDT004",
  DDT005: "DDT005",
  absence: "DDT005",
  DDT006: "DDT006",
  provident_fund: "DDT006",
  DDT009: "DDT009",
  loan: "DDT009",
  SYSWELFARE: "SYSWELFARE",
  SYS001: "SYS001",
  SSO: "SYS001",
  social_security: "SYS001",
  SYS002: "SYS002",
  tax: "SYS002",
};

export function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isTaxDeduction(code: string, label: string): boolean {
  return TAX_CODES.has(code) || /ภาษี/i.test(label);
}

export function isSocialSecurityDeduction(code: string, label: string): boolean {
  return SSO_CODES.has(code) || /ประกันสังคม|ปกส/i.test(label);
}

export function isProvidentFundDeduction(code: string, label: string): boolean {
  return PROVIDENT_FUND_CODES.has(code) || /สำรองเลี้ยงชีพ|pvd/i.test(label);
}

export function isIncentiveIncome(code: string, label: string): boolean {
  return INCENTIVE_CODES.has(code) || /เบี้ยขยัน|ค่าตอบแทน|โบนัส|คอมมิช|incentive/i.test(label);
}

function resolveStandardIncomeCode(code: string, label: string): string | null {
  if (STANDARD_INCOME_CODE_MAP[code]) return STANDARD_INCOME_CODE_MAP[code];
  if (/เงินเดือน/i.test(label)) return "INT001";
  if (/ล่วงเวลา|\bOT\b/i.test(label)) return "INT002";
  if (/เบี้ยขยัน/i.test(label)) return "INT003";
  if (/โบนัส/i.test(label)) return "INT1801001";
  if (/ค่าตอบแทน/i.test(label)) return "INT008";
  if (/ที่พัก/i.test(label)) return "INT19";
  if (/ประกอบวิชาชีพ/i.test(label)) return "license";
  if (/โทรศัพท์/i.test(label)) return "Tel";
  return null;
}

function resolveStandardDeductionCode(code: string, label: string): string | null {
  if (STANDARD_DEDUCTION_CODE_MAP[code]) return STANDARD_DEDUCTION_CODE_MAP[code];
  if (/ลางาน/i.test(label)) return "DDT003";
  if (/มาสาย/i.test(label)) return "DDT004";
  if (/ขาดงาน/i.test(label)) return "DDT005";
  if (/สำรองเลี้ยงชีพ|pvd/i.test(label)) return "DDT006";
  if (/กู้ยืม/i.test(label)) return "DDT009";
  if (/สงเคราะห์/i.test(label)) return "SYSWELFARE";
  if (/ประกันสังคม|ปกส/i.test(label)) return "SYS001";
  if (/ภาษี/i.test(label)) return "SYS002";
  return null;
}

/**
 * Approved OT hours split into weekday / holiday, plus what is still pending, per employee.
 * The day type is derived from the date worked vs. the employee's weekly days off; it is not stored.
 */
export function summarizeOvertime(overtime: PayrollOvertimeInput[], employees: PayrollEmployeeInput[]) {
  const weeklyHolidays = new Map(employees.map((employee) => [employee.employeeId, employee.weeklyHolidays]));
  const totals = new Map<string, OvertimeTotals>();
  for (const item of overtime) {
    const aggregate = totals.get(item.employeeId) ?? { ...NO_OVERTIME };
    const hours = durationHours(item.startAt, item.endAt);
    if (item.statusCode === "approved") {
      if (deriveOvertimeType(item.startAt, weeklyHolidays.get(item.employeeId)) === "holiday") aggregate.holiday += hours;
      else aggregate.weekday += hours;
    } else if (item.statusCode === "pending") {
      aggregate.pending += hours;
      aggregate.pendingCount += 1;
    }
    totals.set(item.employeeId, aggregate);
  }
  return totals;
}

export function groupLeaves(leaves: PayrollLeaveInput[]) {
  const byEmployee = new Map<string, PayrollLeaveLine[]>();
  for (const item of leaves) {
    const lines = byEmployee.get(item.employeeId) ?? [];
    lines.push({ type: item.type, startOn: item.startOn, endOn: item.endOn, session: item.session });
    byEmployee.set(item.employeeId, lines);
  }
  return byEmployee;
}

export type BuildPayrollRowOptions = {
  periodStart?: string;
  periodEnd?: string;
  verifiedEmployeeIds?: ReadonlySet<string>;
  employeeOverride?: PayrollEmployeeOverride;
  socialSecurityRule?: SocialSecurityRateRule;
};

type ResolvedPayItem = {
  code: string;
  label: string;
  amount: number;
};

export function buildPayrollRow(
  employee: PayrollEmployeeInput,
  overtime: OvertimeTotals = NO_OVERTIME,
  leaves: PayrollLeaveLine[] = [],
  options: BuildPayrollRowOptions = {},
): PayrollRow {
  const payrollData = normalizeEmployeePayrollData(employee.payrollData);
  const override = options.employeeOverride;
  const workingDays = typeof override?.workingDays === "number" && Number.isFinite(override.workingDays)
    ? override.workingDays
    : null;
  const overrideQuantities = override?.quantities ?? {};

  const resolveItems = (
    items: typeof payrollData.incomeItems,
    overrideBucket: Partial<Record<string, number>> | undefined,
    standardResolver: (code: string, label: string) => string | null,
    skipDailyItems = false,
  ) => {
    const priced: ResolvedPayItem[] = [];
    const unresolved: { label: string; amount: number; unit: string }[] = [];

    for (const item of items) {
      if (!item.enabled || item.amount <= 0) continue;
      if (skipDailyItems && item.unit === "day") continue;
      const standardCode = standardResolver(item.code, item.label);
      const hasExplicitOverride = Boolean(
        overrideBucket && (
          typeof overrideBucket[item.code] === "number"
          || (standardCode && typeof overrideBucket[standardCode] === "number")
        ),
      );
      if (item.unit === "period") {
        priced.push({ code: item.code, label: item.label, amount: money(item.amount) });
      } else {
        const explicitQty = overrideQuantities[item.code];
        const qty = typeof explicitQty === "number" && Number.isFinite(explicitQty) && explicitQty >= 0
          ? explicitQty
          : (item.unit === "day" && workingDays != null && workingDays >= 0 ? workingDays : null);
        if (qty != null) {
          priced.push({ code: item.code, label: item.label, amount: money(item.amount * qty) });
        } else if (!hasExplicitOverride) {
          unresolved.push({ label: item.label, amount: money(item.amount), unit: item.unit });
        }
      }
    }
    return { priced, unresolved };
  };

  const hasExplicitDailyRate = typeof override?.dailyRate === "number" && Number.isFinite(override.dailyRate);
  const resolvedIncome = resolveItems(
    payrollData.incomeItems,
    override?.incomes,
    resolveStandardIncomeCode,
    hasExplicitDailyRate,
  );
  const resolvedDeduction = resolveItems(payrollData.deductionItems, override?.deductions, resolveStandardDeductionCode);
  const unpricedItems = [...resolvedIncome.unresolved, ...resolvedDeduction.unresolved];

  const baseSalaryFromProfile = employee.baseSalary == null ? null : money(employee.baseSalary);
  const overrideSalary = override?.incomes?.INT001;
  const baseSalary = typeof overrideSalary === "number" && Number.isFinite(overrideSalary)
    ? money(overrideSalary)
    : baseSalaryFromProfile;

  const ratePerHour = baseSalary == null || !employee.workHoursPerDay ? null : baseSalary / 30 / employee.workHoursPerDay;
  const calculatedWeekdayOtAmount = ratePerHour == null
    ? 0
    : money(overtime.weekday * ratePerHour * employee.weekdayMultiplier);
  const calculatedHolidayOtAmount = ratePerHour == null
    ? 0
    : money(overtime.holiday * ratePerHour * employee.holidayMultiplier);
  const ot1xAmount = typeof override?.ot1xAmount === "number" && Number.isFinite(override.ot1xAmount)
    ? money(override.ot1xAmount)
    : 0;
  const hasExplicitOtSplit = (
    typeof override?.ot1xAmount === "number"
    || typeof override?.weekdayOtAmount === "number"
    || typeof override?.holidayOtAmount === "number"
  );
  let weekdayOtAmount = typeof override?.weekdayOtAmount === "number" && Number.isFinite(override.weekdayOtAmount)
    ? money(override.weekdayOtAmount)
    : calculatedWeekdayOtAmount;
  let holidayOtAmount = typeof override?.holidayOtAmount === "number" && Number.isFinite(override.holidayOtAmount)
    ? money(override.holidayOtAmount)
    : calculatedHolidayOtAmount;

  const calculatedOtAmount = ratePerHour == null
    ? null
    : money(calculatedWeekdayOtAmount + calculatedHolidayOtAmount);
  const overrideOt = override?.incomes?.INT002;
  const otAmount = hasExplicitOtSplit
    ? money(ot1xAmount + weekdayOtAmount + holidayOtAmount)
    : typeof overrideOt === "number" && Number.isFinite(overrideOt)
      ? money(overrideOt)
      : calculatedOtAmount;

  if (!hasExplicitOtSplit && typeof overrideOt === "number" && Number.isFinite(overrideOt)) {
    const calcSum = money(calculatedWeekdayOtAmount + calculatedHolidayOtAmount);
    if (calcSum > 0) {
      const ratio = overrideOt / calcSum;
      weekdayOtAmount = money(calculatedWeekdayOtAmount * ratio);
      holidayOtAmount = money(overrideOt - weekdayOtAmount);
    } else {
      weekdayOtAmount = money(overrideOt);
      holidayOtAmount = 0;
    }
  }

  const profileDailyRate = money(
    payrollData.incomeItems
      .filter((item) => item.enabled && item.unit === "day" && item.amount > 0)
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const dailyRate = typeof override?.dailyRate === "number" && Number.isFinite(override.dailyRate)
    ? money(override.dailyRate)
    : profileDailyRate;
  const dailyWageTotal = workingDays != null && dailyRate > 0 ? money(dailyRate * workingDays) : 0;

  const defaultPaymentMethod = !payrollData.accountNumber || /เงินสด|cash/i.test(payrollData.bankName)
    ? "cash"
    : "transfer";
  const paymentMethod = override?.paymentMethod === "cash" || override?.paymentMethod === "transfer"
    ? override.paymentMethod
    : defaultPaymentMethod;
  const remark = typeof override?.remark === "string"
    ? override.remark.trim()
    : paymentMethod === "cash"
      ? "เงินสด"
      : "";

  const incomeBreakdown: Record<string, number> = Object.fromEntries(
    STANDARD_INCOME_COLUMNS.map((col) => [col.code, 0]),
  );
  incomeBreakdown.INT001 = baseSalary ?? 0;
  incomeBreakdown.INT002 = otAmount ?? 0;

  const customFixedIncomes: ResolvedPayItem[] = [];
  if (hasExplicitDailyRate && dailyWageTotal > 0) {
    customFixedIncomes.push({ code: "DAILY_WAGE", label: "ค่าแรงรายวัน", amount: dailyWageTotal });
  }
  const profileIncomeLabels = new Map<string, string>();
  for (const item of resolvedIncome.priced) {
    const stdCode = resolveStandardIncomeCode(item.code, item.label);
    if (stdCode && stdCode in incomeBreakdown) {
      if (stdCode === "INT002") {
        // Fixed INT002 adds to OT column only if not overridden at INT002 or OT-split level
        if (!hasExplicitOtSplit && typeof overrideOt !== "number") {
          incomeBreakdown.INT002 = money(incomeBreakdown.INT002 + item.amount);
        }
      } else {
        incomeBreakdown[stdCode] = money(incomeBreakdown[stdCode] + item.amount);
      }
      if (!profileIncomeLabels.has(stdCode)) profileIncomeLabels.set(stdCode, item.label);
    } else {
      customFixedIncomes.push(item);
    }
  }

  for (const col of STANDARD_INCOME_COLUMNS) {
    if (col.code === "INT001" || col.code === "INT002") continue;
    const val = override?.incomes?.[col.code];
    if (typeof val === "number" && Number.isFinite(val)) {
      incomeBreakdown[col.code] = money(val);
    }
  }

  const deductionBreakdown: Record<string, number> = Object.fromEntries(
    STANDARD_DEDUCTION_COLUMNS.map((col) => [col.code, 0]),
  );
  const customFixedDeductions: ResolvedPayItem[] = [];
  const profileDeductionLabels = new Map<string, string>();
  for (const item of resolvedDeduction.priced) {
    const stdCode = resolveStandardDeductionCode(item.code, item.label);
    if (stdCode && stdCode in deductionBreakdown) {
      deductionBreakdown[stdCode] = money(deductionBreakdown[stdCode] + item.amount);
      if (!profileDeductionLabels.has(stdCode)) profileDeductionLabels.set(stdCode, item.label);
    } else {
      customFixedDeductions.push(item);
    }
  }

  const hasFixedProfileSso = deductionBreakdown.SYS001 > 0;
  const overrideSso = override?.deductions?.SYS001;
  const hasOverrideSso = typeof overrideSso === "number" && Number.isFinite(overrideSso);

  for (const col of STANDARD_DEDUCTION_COLUMNS) {
    const val = override?.deductions?.[col.code];
    if (typeof val === "number" && Number.isFinite(val)) {
      deductionBreakdown[col.code] = money(val);
    }
  }

  const activeSsoRule = options.socialSecurityRule
    ?? resolveSocialSecurityRuleForDate(options.periodStart ?? new Date().toISOString().slice(0, 10));
  const autoSso = !hasOverrideSso && !hasFixedProfileSso && payrollData.socialSecurityEnabled !== false && baseSalary != null
    ? calculateSocialSecurityContribution(money((incomeBreakdown.INT001 ?? 0) + dailyWageTotal), activeSsoRule)
    : null;
  if (autoSso) {
    deductionBreakdown.SYS001 = autoSso.employeeAmount;
  }

  // Reconstruct itemized PayrollLine arrays preserving original labels where available
  const incomes: PayrollLine[] = [];
  if (baseSalary != null) {
    incomes.push({ label: "เงินเดือน", amount: incomeBreakdown.INT001 });
  }
  for (const col of STANDARD_INCOME_COLUMNS) {
    if (col.code === "INT001" || col.code === "INT002") continue;
    const amount = incomeBreakdown[col.code];
    if (amount > 0) {
      incomes.push({ label: profileIncomeLabels.get(col.code) ?? col.label, amount });
    }
  }
  for (const custom of customFixedIncomes) {
    if (custom.amount > 0) incomes.push({ label: custom.label, amount: custom.amount });
  }
  if (otAmount != null && incomeBreakdown.INT002 > 0) {
    incomes.push({ label: "ค่าล่วงเวลา (OT)", amount: incomeBreakdown.INT002 });
  }

  const deductions: PayrollLine[] = [];
  for (const col of STANDARD_DEDUCTION_COLUMNS) {
    const amount = deductionBreakdown[col.code];
    if (amount > 0) {
      deductions.push({ label: profileDeductionLabels.get(col.code) ?? col.label, amount });
    }
  }
  for (const custom of customFixedDeductions) {
    if (custom.amount > 0) deductions.push({ label: custom.label, amount: custom.amount });
  }

  const ready = baseSalary != null && otAmount != null && unpricedItems.length === 0;
  const incomeTotal = ready ? money(incomes.reduce((sum, item) => sum + item.amount, 0)) : null;
  const deductionTotal = ready ? money(deductions.reduce((sum, item) => sum + item.amount, 0)) : null;
  const netPay = incomeTotal == null || deductionTotal == null ? null : money(incomeTotal - deductionTotal);

  let incentiveIncomeTotal = 0;
  let allowanceIncomeTotal = 0;
  for (const col of STANDARD_INCOME_COLUMNS) {
    if (col.code === "INT001" || col.code === "INT002") continue;
    const amount = incomeBreakdown[col.code];
    if (amount <= 0) continue;
    if (isIncentiveIncome(col.code, col.label)) incentiveIncomeTotal = money(incentiveIncomeTotal + amount);
    else allowanceIncomeTotal = money(allowanceIncomeTotal + amount);
  }
  for (const custom of customFixedIncomes) {
    if (custom.amount <= 0) continue;
    if (isIncentiveIncome(custom.code, custom.label)) incentiveIncomeTotal = money(incentiveIncomeTotal + custom.amount);
    else allowanceIncomeTotal = money(allowanceIncomeTotal + custom.amount);
  }
  const otherIncomeTotal = money(incentiveIncomeTotal + allowanceIncomeTotal);

  const taxAmount = deductionBreakdown.SYS002;
  const socialSecurityAmount = deductionBreakdown.SYS001;
  const providentFundAmount = deductionBreakdown.DDT006;
  const fixedDeductionsTotal = money(deductions.reduce((sum, item) => sum + item.amount, 0));
  const otherDeductionsAmount = money(fixedDeductionsTotal - taxAmount - socialSecurityAmount);
  const employerSocialSecurity = autoSso
    ? autoSso.employerAmount
    : hasOverrideSso && socialSecurityAmount > 0
      && activeSsoRule.employeeRatePercent > 0
      && activeSsoRule.employeeRatePercent !== activeSsoRule.employerRatePercent
      ? Math.round(socialSecurityAmount * (activeSsoRule.employerRatePercent / activeSsoRule.employeeRatePercent))
      : socialSecurityAmount;

  const isNewHire = Boolean(
    options.periodStart && options.periodEnd
    && employee.startDate >= options.periodStart && employee.startDate <= options.periodEnd,
  );
  const isOffboarded = Boolean(
    options.periodStart && options.periodEnd
    && employee.endDate && employee.endDate >= options.periodStart && employee.endDate <= options.periodEnd,
  );

  const reviewIssues: PayrollReviewIssue[] = [];
  if (baseSalary == null) {
    reviewIssues.push({ code: "missing_base_salary", severity: "blocking", message: "ยังไม่ได้ระบุฐานเงินเดือน" });
  }
  if (employee.workHoursPerDay <= 0) {
    reviewIssues.push({ code: "invalid_work_hours", severity: "blocking", message: "ยังไม่ได้ระบุชั่วโมงทำงานต่อวัน" });
  }
  if (unpricedItems.length > 0) {
    reviewIssues.push({
      code: "unpriced_items",
      severity: "blocking",
      message: `มีรายการหน่วยไม่ใช่งวดที่ต้องตรวจสอบ (${unpricedItems.map((item) => item.label).join(", ")})`,
    });
  }
  if (netPay != null && netPay < 0) {
    reviewIssues.push({ code: "negative_net_pay", severity: "blocking", message: "ยอดจ่ายสุทธิติดลบ" });
  }
  if (overtime.pendingCount > 0) {
    reviewIssues.push({
      code: "pending_ot",
      severity: "warning",
      message: `มีคำขอ OT รออนุมัติ ${overtime.pendingCount} รายการ (${round2(overtime.pending)} ชม.)`,
    });
  }
  if (!payrollData.accountNumber) {
    reviewIssues.push({ code: "missing_bank", severity: "warning", message: "ยังไม่มีเลขที่บัญชีธนาคาร" });
  }
  if (baseSalary != null && baseSalary > 0 && (otAmount ?? 0) >= baseSalary * 0.25) {
    reviewIssues.push({ code: "high_ot", severity: "warning", message: "ค่า OT สูงกว่า 25% ของฐานเงินเดือน" });
  }
  if (baseSalary != null && baseSalary > 0 && otherIncomeTotal >= baseSalary * 0.25) {
    reviewIssues.push({ code: "high_other_income", severity: "warning", message: "เงินได้อื่นสูงกว่า 25% ของฐานเงินเดือน" });
  }
  if (isNewHire) {
    reviewIssues.push({ code: "mid_period_change", severity: "warning", message: "เข้างานใหม่ระหว่างงวด" });
  }
  if (isOffboarded) {
    reviewIssues.push({ code: "mid_period_change", severity: "warning", message: "พ้นสภาพระหว่างงวด" });
  }

  const hasBlockingIssue = reviewIssues.some((issue) => issue.severity === "blocking");
  const isVerified = !hasBlockingIssue && Boolean(options.verifiedEmployeeIds?.has(employee.employeeId));
  const needsReview = hasBlockingIssue || (reviewIssues.length > 0 && !isVerified);

  const hasPeriodOverride = Boolean(
    override && (
      (override.incomes && Object.keys(override.incomes).length > 0)
      || (override.deductions && Object.keys(override.deductions).length > 0)
      || override.workingDays != null
      || override.dailyRate != null
      || override.ot1xAmount != null
      || override.weekdayOtAmount != null
      || override.holidayOtAmount != null
      || override.paymentMethod != null
      || (typeof override.remark === "string" && override.remark.length > 0)
      || (override.quantities && Object.keys(override.quantities).length > 0)
    ),
  );

  return {
    employeeId: employee.employeeId,
    code: employee.code,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    prefix: employee.prefix ?? "",
    firstName: employee.firstName,
    lastName: employee.lastName,
    citizenId: employee.citizenId ?? "",
    avatarUrl: employee.avatarUrl ?? null,
    department: employee.department ?? "",
    bankName: payrollData.bankName,
    bankAccount: payrollData.accountNumber,
    startDate: employee.startDate,
    endDate: employee.endDate ?? null,
    isNewHire,
    isOffboarded,
    taxCondition: payrollData.taxCondition,
    doNotPrintPayslip: payrollData.doNotPrintPayslip,
    baseSalary,
    workHoursPerDay: employee.workHoursPerDay,
    incomes,
    deductions,
    incomeBreakdown,
    deductionBreakdown,
    workingDays,
    dailyRate,
    dailyWageTotal,
    ot1xAmount,
    weekdayOtAmount,
    holidayOtAmount,
    paymentMethod,
    remark,
    hasPeriodOverride,
    unpricedItems,
    weekdayOtHours: round2(overtime.weekday),
    holidayOtHours: round2(overtime.holiday),
    pendingOtHours: round2(overtime.pending),
    pendingOtRequests: overtime.pendingCount,
    otAmount: incomeBreakdown.INT002 === 0 && otAmount == null ? null : incomeBreakdown.INT002,
    otherIncomeTotal,
    incentiveIncomeTotal,
    allowanceIncomeTotal,
    taxAmount,
    socialSecurityAmount,
    providentFundAmount,
    otherDeductionsAmount,
    employerSocialSecurity,
    approvedLeaveRequests: leaves.length,
    approvedLeaves: leaves,
    incomeTotal,
    deductionTotal,
    netPay,
    reviewIssues,
    hasBlockingIssue,
    isVerified,
    needsReview,
  };
}

export function summarizePayroll(rows: PayrollRow[], previousGrossTotal: number | null = null): PayrollSummary {
  const pricedRows = rows.filter((row) => row.incomeTotal != null && row.deductionTotal != null && row.netPay != null);
  const grossTotal = money(pricedRows.reduce((sum, row) => sum + (row.incomeTotal ?? 0), 0));
  const deductionTotal = money(pricedRows.reduce((sum, row) => sum + (row.deductionTotal ?? 0), 0));
  const netTotal = money(pricedRows.reduce((sum, row) => sum + (row.netPay ?? 0), 0));

  const taxTotal = money(pricedRows.reduce((sum, row) => sum + row.taxAmount, 0));
  const socialSecurityTotal = money(pricedRows.reduce((sum, row) => sum + row.socialSecurityAmount, 0));
  const employerSocialSecurityTotal = money(pricedRows.reduce((sum, row) => sum + row.employerSocialSecurity, 0));
  const providentFundTotal = money(pricedRows.reduce((sum, row) => sum + row.providentFundAmount, 0));
  const otherDeductionsTotal = money(pricedRows.reduce((sum, row) => sum + row.otherDeductionsAmount, 0));
  const taxAndSsoTotal = money(taxTotal + socialSecurityTotal);

  const baseSalaryCost = money(pricedRows.reduce((sum, row) => sum + (row.baseSalary ?? 0), 0));
  const overtimeCost = money(pricedRows.reduce((sum, row) => sum + (row.otAmount ?? 0), 0));
  const incentivesCost = money(pricedRows.reduce((sum, row) => sum + row.incentiveIncomeTotal, 0));
  const allowancesCost = money(pricedRows.reduce((sum, row) => sum + row.allowanceIncomeTotal, 0));
  const totalCost = money(grossTotal + employerSocialSecurityTotal);

  const grossChangePercent = previousGrossTotal != null && previousGrossTotal > 0
    ? Math.round((((grossTotal - previousGrossTotal) / previousGrossTotal) * 100 + Number.EPSILON) * 10) / 10
    : null;

  return {
    employeeCount: rows.length,
    newHireCount: rows.filter((row) => row.isNewHire).length,
    offboardedCount: rows.filter((row) => row.isOffboarded).length,
    grossTotal,
    previousGrossTotal,
    grossChangePercent,
    taxTotal,
    socialSecurityTotal,
    employerSocialSecurityTotal,
    providentFundTotal,
    taxAndSsoTotal,
    otherDeductionsTotal,
    deductionTotal,
    netTotal,
    reviewCount: rows.filter((row) => row.needsReview).length,
    blockingCount: rows.filter((row) => row.hasBlockingIssue).length,
    verifiedCount: rows.filter((row) => row.isVerified).length,
    pendingOtRequestCount: rows.reduce((sum, row) => sum + row.pendingOtRequests, 0),
    costBreakdown: {
      baseSalary: baseSalaryCost,
      overtime: overtimeCost,
      incentives: incentivesCost,
      allowances: allowancesCost,
      employerContributions: employerSocialSecurityTotal,
      total: totalCost,
    },
  };
}
