import { normalizeEmployeePayrollData } from "@/lib/employees/payroll-data";
import { deriveOvertimeType } from "@/lib/ot/overtime-type";
import { durationHours, round2 } from "@/app/api/ot/_shared";
import type { PayrollEmployeeInput, PayrollLeaveInput, PayrollOvertimeInput } from "./inputs";
import type { PayrollLeaveLine, PayrollRow } from "./types";

// Pure calculation: no database, no HTTP. Pay rate = salary / 30 days / working hours per day.

type OvertimeTotals = { weekday: number; holiday: number; pending: number; pendingCount: number };
const NO_OVERTIME: OvertimeTotals = { weekday: 0, holiday: 0, pending: 0, pendingCount: 0 };

export function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

export function buildPayrollRow(
  employee: PayrollEmployeeInput,
  overtime: OvertimeTotals = NO_OVERTIME,
  leaves: PayrollLeaveLine[] = [],
): PayrollRow {
  const payrollData = normalizeEmployeePayrollData(employee.payrollData);
  const enabledItems = <T extends { enabled: boolean; amount: number }>(items: T[]) =>
    items.filter((item) => item.enabled && item.amount > 0);
  const perPeriod = <T extends { enabled: boolean; amount: number; unit: string; label: string }>(items: T[]) =>
    enabledItems(items).filter((item) => item.unit === "period").map((item) => ({ label: item.label, amount: money(item.amount) }));

  const fixedIncome = perPeriod(payrollData.incomeItems);
  const fixedDeductions = perPeriod(payrollData.deductionItems);
  const unpricedItems = enabledItems([...payrollData.incomeItems, ...payrollData.deductionItems])
    .filter((item) => item.unit !== "period").map((item) => ({ label: item.label, amount: money(item.amount), unit: item.unit }));

  const baseSalary = employee.baseSalary == null ? null : money(employee.baseSalary);
  const ratePerHour = baseSalary == null || !employee.workHoursPerDay ? null : baseSalary / 30 / employee.workHoursPerDay;
  const otAmount = ratePerHour == null
    ? null
    : money(overtime.weekday * ratePerHour * employee.weekdayMultiplier + overtime.holiday * ratePerHour * employee.holidayMultiplier);

  const incomes = [
    ...(baseSalary == null ? [] : [{ label: "เงินเดือน", amount: baseSalary }]),
    ...fixedIncome,
    ...(otAmount == null || otAmount === 0 ? [] : [{ label: "ค่าล่วงเวลา (OT)", amount: otAmount }]),
  ];
  const ready = baseSalary != null && otAmount != null && unpricedItems.length === 0;
  const incomeTotal = ready ? money(incomes.reduce((sum, item) => sum + item.amount, 0)) : null;
  const deductionTotal = ready ? money(fixedDeductions.reduce((sum, item) => sum + item.amount, 0)) : null;

  return {
    employeeId: employee.employeeId, code: employee.code, name: `${employee.firstName} ${employee.lastName}`.trim(),
    department: employee.department ?? "", bankName: payrollData.bankName, bankAccount: payrollData.accountNumber,
    baseSalary, workHoursPerDay: employee.workHoursPerDay, incomes, deductions: fixedDeductions, unpricedItems,
    weekdayOtHours: round2(overtime.weekday), holidayOtHours: round2(overtime.holiday),
    pendingOtHours: round2(overtime.pending), pendingOtRequests: overtime.pendingCount,
    otAmount, approvedLeaveRequests: leaves.length, approvedLeaves: leaves,
    incomeTotal, deductionTotal,
    netPay: incomeTotal == null || deductionTotal == null ? null : money(incomeTotal - deductionTotal),
  };
}
