export type PayrollLine = { label: string; amount: number };

export type PayrollLeaveLine = { type: string; startOn: string; endOn: string; session: string };

/** One employee's payroll for a period. Totals are null while anything needed to price the row is missing. */
export type PayrollRow = {
  employeeId: string;
  code: string;
  name: string;
  department: string;
  bankName: string;
  bankAccount: string;
  baseSalary: number | null;
  workHoursPerDay: number;
  incomes: PayrollLine[];
  deductions: PayrollLine[];
  /** Enabled items whose unit is not "period" (per day/hour): they need a quantity, so the row cannot be priced. */
  unpricedItems: { label: string; amount: number; unit: string }[];
  weekdayOtHours: number;
  holidayOtHours: number;
  pendingOtHours: number;
  pendingOtRequests: number;
  otAmount: number | null;
  approvedLeaveRequests: number;
  approvedLeaves: PayrollLeaveLine[];
  incomeTotal: number | null;
  deductionTotal: number | null;
  netPay: number | null;
};

export type Payroll = {
  year: number;
  month: number;
  /** First and last day (inclusive, "YYYY-MM-DD", Asia/Bangkok) of the calendar-month payroll period. */
  periodStart: string;
  periodEnd: string;
  rows: PayrollRow[];
};
