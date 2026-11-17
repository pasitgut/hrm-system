import { monthRangeUtc, utcToBangkokParts } from "@/app/api/ot/_shared";
import { buildPayrollRow, groupLeaves, summarizeOvertime } from "./calculate";
import { loadPayrollInputs } from "./inputs";
import type { Payroll } from "./types";

const DAY_MS = 86_400_000;

/** Payroll for the period labelled by `year`/`month`: the calendar month, 1st through last day (Asia/Bangkok). */
export async function createPayroll(year: number, month: number): Promise<Payroll> {
  const { start, end } = monthRangeUtc(`${year}-${String(month).padStart(2, "0")}`);
  const startDate = utcToBangkokParts(start).date;
  const endExclusiveDate = utcToBangkokParts(end).date;

  const inputs = await loadPayrollInputs({ start, end, startDate, endExclusiveDate });
  const overtimeByEmployee = summarizeOvertime(inputs.overtime, inputs.employees);
  const leavesByEmployee = groupLeaves(inputs.leaves);

  return {
    year,
    month,
    periodStart: startDate,
    periodEnd: new Date(new Date(`${endExclusiveDate}T00:00:00Z`).getTime() - DAY_MS).toISOString().slice(0, 10),
    rows: inputs.employees.map((employee) =>
      buildPayrollRow(employee, overtimeByEmployee.get(employee.employeeId), leavesByEmployee.get(employee.employeeId))),
  };
}
