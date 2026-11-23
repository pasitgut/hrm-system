import type { SocialSecurityRateRule } from "@/lib/settings/socialSecuritySettings";

export type PayrollLine = { label: string; amount: number };

export type PayrollLeaveLine = { type: string; startOn: string; endOn: string; session: string };

export const STANDARD_INCOME_COLUMNS = [
  { code: "INT001", label: "เงินเดือน", shortLabel: "เงินเดือน" },
  { code: "INT002", label: "ค่าล่วงเวลา", shortLabel: "ค่าล่วงเวลา" },
  { code: "INT003", label: "เบี้ยขยัน", shortLabel: "เบี้ยขยัน" },
  { code: "INT008", label: "ค่าตอบแทน", shortLabel: "ค่าตอบแทน" },
  { code: "INT1801001", label: "โบนัส", shortLabel: "โบนัส" },
  { code: "INT19", label: "ค่าที่พักอาศัย", shortLabel: "ค่าที่พักอาศัย" },
  { code: "license", label: "ค่าใบประกอบวิชาชีพ", shortLabel: "ค่าใบประกอบฯ" },
  { code: "Tel", label: "ค่าโทรศัพท์", shortLabel: "ค่าโทรศัพท์" },
] as const;

export const STANDARD_DEDUCTION_COLUMNS = [
  { code: "DDT003", label: "ลางาน", shortLabel: "ลางาน" },
  { code: "DDT004", label: "มาสาย", shortLabel: "มาสาย" },
  { code: "DDT005", label: "ขาดงาน", shortLabel: "ขาดงาน" },
  { code: "DDT006", label: "กองทุนสำรองเลี้ยงชีพ", shortLabel: "ก.สำรองเลี้ยงชีพ" },
  { code: "DDT009", label: "กองทุนกู้ยืม", shortLabel: "กองทุนกู้ยืม" },
  { code: "SYSWELFARE", label: "กองทุนสงเคราะห์ลูกจ้าง", shortLabel: "กองทุนสงเคราะห์ฯ" },
  { code: "SYS001", label: "ประกันสังคม", shortLabel: "ประกันสังคม" },
  { code: "SYS002", label: "ภาษี", shortLabel: "ภาษี" },
] as const;

export type PayrollPaymentMethod = "transfer" | "cash";

export type PayrollEmployeeOverride = {
  incomes?: Partial<Record<string, number>>;
  deductions?: Partial<Record<string, number>>;
  workingDays?: number | null;
  dailyRate?: number | null;
  ot1xAmount?: number | null;
  weekdayOtAmount?: number | null;
  holidayOtAmount?: number | null;
  paymentMethod?: PayrollPaymentMethod;
  remark?: string;
  quantities?: Partial<Record<string, number>>;
  updatedAt?: string;
};

export type PayrollPeriodSettings = {
  groupName?: string;
  includeMonthly?: boolean;
  includeDaily?: boolean;
  payDate?: string;
  leaveCutoffDate?: string;
  otCutoffDate?: string;
};

export type PayrollRunStatus = "review" | "pending_approval" | "approved" | "locked" | "paid";

export type PayrollWorkflowAction =
  | "toggle_verify"
  | "submit_approval"
  | "approve"
  | "reject_to_review"
  | "lock"
  | "reopen"
  | "mark_paid"
  | "save_employee_override"
  | "reset_employee_override"
  | "save_working_days"
  | "bulk_import_overrides"
  | "recalculate_period"
  | "close_period"
  | "update_period_settings";

export type PayrollReviewIssueCode =
  | "missing_base_salary"
  | "invalid_work_hours"
  | "unpriced_items"
  | "negative_net_pay"
  | "pending_ot"
  | "missing_bank"
  | "high_ot"
  | "high_other_income"
  | "mid_period_change";

export type PayrollReviewIssue = {
  code: PayrollReviewIssueCode;
  severity: "blocking" | "warning";
  message: string;
};

/** One employee's payroll for a period. Totals are null while anything needed to price the row is missing. */
export type PayrollRow = {
  employeeId: string;
  code: string;
  name: string;
  prefix: string;
  firstName: string;
  lastName: string;
  citizenId: string;
  avatarUrl: string | null;
  department: string;
  bankName: string;
  bankAccount: string;
  startDate: string;
  endDate: string | null;
  isNewHire: boolean;
  isOffboarded: boolean;
  taxCondition: "withhold" | "no_withholding";
  doNotPrintPayslip: boolean;
  baseSalary: number | null;
  workHoursPerDay: number;
  incomes: PayrollLine[];
  deductions: PayrollLine[];
  incomeBreakdown: Record<string, number>;
  deductionBreakdown: Record<string, number>;
  workingDays: number | null;
  dailyRate: number;
  dailyWageTotal: number;
  ot1xAmount: number;
  weekdayOtAmount: number;
  holidayOtAmount: number;
  paymentMethod: PayrollPaymentMethod;
  remark: string;
  hasPeriodOverride: boolean;
  /** Enabled items whose unit is not "period" (per day/hour): they need a quantity, so the row cannot be priced. */
  unpricedItems: { label: string; amount: number; unit: string }[];
  weekdayOtHours: number;
  holidayOtHours: number;
  pendingOtHours: number;
  pendingOtRequests: number;
  otAmount: number | null;
  otherIncomeTotal: number;
  incentiveIncomeTotal: number;
  allowanceIncomeTotal: number;
  taxAmount: number;
  socialSecurityAmount: number;
  providentFundAmount: number;
  otherDeductionsAmount: number;
  employerSocialSecurity: number;
  approvedLeaveRequests: number;
  approvedLeaves: PayrollLeaveLine[];
  incomeTotal: number | null;
  deductionTotal: number | null;
  netPay: number | null;
  reviewIssues: PayrollReviewIssue[];
  hasBlockingIssue: boolean;
  isVerified: boolean;
  needsReview: boolean;
};

export type PayrollCostBreakdown = {
  baseSalary: number;
  overtime: number;
  incentives: number;
  allowances: number;
  employerContributions: number;
  total: number;
};

export type PayrollSummary = {
  employeeCount: number;
  newHireCount: number;
  offboardedCount: number;
  grossTotal: number;
  previousGrossTotal: number | null;
  grossChangePercent: number | null;
  taxTotal: number;
  socialSecurityTotal: number;
  employerSocialSecurityTotal: number;
  providentFundTotal: number;
  taxAndSsoTotal: number;
  otherDeductionsTotal: number;
  deductionTotal: number;
  netTotal: number;
  reviewCount: number;
  blockingCount: number;
  verifiedCount: number;
  pendingOtRequestCount: number;
  costBreakdown: PayrollCostBreakdown;
};

export type PayrollWorkflow = {
  status: PayrollRunStatus;
  verifiedEmployeeIds: string[];
  hasSnapshot: boolean;
  overrides: Record<string, PayrollEmployeeOverride>;
  settings: PayrollPeriodSettings;
  submittedByName: string | null;
  submittedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  lockedByName: string | null;
  lockedAt: string | null;
  paidByName: string | null;
  paidAt: string | null;
  note: string | null;
};

export type Payroll = {
  year: number;
  month: number;
  /** First and last day (inclusive, "YYYY-MM-DD", Asia/Bangkok) of the calendar-month payroll period. */
  periodStart: string;
  periodEnd: string;
  payDate: string;
  companyName: string;
  socialSecurityRule?: SocialSecurityRateRule;
  rows: PayrollRow[];
  summary: PayrollSummary;
  workflow: PayrollWorkflow;
};

export type PayrollPeriodSummary = {
  year: number;
  month: number;
  periodCode: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  leaveCutoffDate: string;
  otCutoffDate: string;
  status: "open" | "closed";
  workflowStatus: PayrollRunStatus;
  groupName: string;
  includeMonthly: boolean;
  includeDaily: boolean;
  employeeCount: number;
  overrideCount: number;
  netTotal: number | null;
  lockedAt: string | null;
  lockedByName: string | null;
};
