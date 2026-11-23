import { withCumulative, type ExportSlip, type SlipData } from "@/lib/salary-slips/model";
import { createPayroll } from "./service";
import type { Payroll, PayrollRow } from "./types";

function toSatang(baht: number | null | undefined): number {
  if (typeof baht !== "number" || !Number.isFinite(baht)) return 0;
  return Math.round(baht * 100);
}

function addAmount(bucket: Record<string, number>, key: string, satang: number) {
  if (satang === 0) return;
  bucket[key] = (bucket[key] ?? 0) + satang;
}

function mapIncomeLabelToSlipKey(label: string): string {
  if (label === "เงินเดือน") return "salary";
  if (label.includes("ล่วงเวลา") || /\bOT\b/i.test(label)) return "ot";
  if (label.includes("เบี้ยขยัน")) return "attendance_bonus";
  if (label.includes("โบนัส")) return "bonus";
  if (label.includes("ที่พัก")) return "housing";
  if (label.includes("ใบประกอบวิชาชีพ")) return "license";
  if (label.includes("โทรศัพท์")) return "phone";
  return "compensation";
}

function mapDeductionLabelToSlipKey(label: string): string {
  if (label.includes("ลางาน")) return "leave";
  if (label.includes("มาสาย")) return "late";
  if (label.includes("ขาดงาน")) return "absence";
  if (label.includes("สำรองเลี้ยงชีพ") || /pvd/i.test(label)) return "provident_fund";
  if (label.includes("ประกันสังคม") || /ปกส/.test(label)) return "social_security";
  if (label.includes("ภาษี")) return "tax";
  return "loan";
}

/** Converts a priced HRM PayrollRow into integer-satang SlipData compatible with PDF/Excel slip generators. */
export function payrollRowToSlipData(row: PayrollRow, year: number, month: number): SlipData {
  const incomes: Record<string, number> = {};
  for (const item of row.incomes) {
    addAmount(incomes, mapIncomeLabelToSlipKey(item.label), toSatang(item.amount));
  }

  const deductions: Record<string, number> = {};
  for (const item of row.deductions) {
    addAmount(deductions, mapDeductionLabelToSlipKey(item.label), toSatang(item.amount));
  }

  const incomeTotal = Object.values(incomes).reduce((sum, value) => sum + value, 0);
  const deductionTotal = Object.values(deductions).reduce((sum, value) => sum + value, 0);
  const netPay = incomeTotal - deductionTotal;

  return {
    code: row.code,
    name: row.name,
    department: row.department,
    year,
    month,
    bank: row.bankName,
    bankAccount: row.bankAccount,
    incomes,
    deductions,
    incomeTotal,
    deductionTotal,
    netPay,
  };
}

/**
 * Computes YTD cumulative totals across months 1..targetMonth for ready HRM payroll rows,
 * returning ExportSlip items for the target period.
 */
export function buildHrmExportSlips(
  monthlyPayrolls: Payroll[],
  targetYear: number,
  targetMonth: number,
  employeeIds?: string[],
): ExportSlip[] {
  const selectedIds = employeeIds && employeeIds.length > 0 ? new Set(employeeIds) : null;
  const allEntries: { id: string; employeeId: string; revision: number; data: SlipData; doNotPrint: boolean }[] = [];

  for (const periodPayroll of monthlyPayrolls) {
    if (periodPayroll.year !== targetYear || periodPayroll.month > targetMonth) continue;
    for (const row of periodPayroll.rows) {
      if (row.netPay == null) continue;
      allEntries.push({
        id: `${row.employeeId}:${periodPayroll.year}-${periodPayroll.month}`,
        employeeId: row.employeeId,
        revision: 1,
        data: payrollRowToSlipData(row, periodPayroll.year, periodPayroll.month),
        doNotPrint: row.doNotPrintPayslip,
      });
    }
  }

  const doNotPrintMap = new Map(allEntries.map((entry) => [entry.id, entry.doNotPrint]));
  const withYtd = withCumulative(
    allEntries.map(({ id, employeeId, revision, data }) => ({ id, employeeId, revision, data })),
  );

  return withYtd
    .filter((item) => {
      if (item.data.year !== targetYear || item.data.month !== targetMonth) return false;
      if (selectedIds) return selectedIds.has(item.employeeId);
      return !doNotPrintMap.get(item.id);
    })
    .sort((left, right) =>
      left.data.code.localeCompare(right.data.code, "th-TH", { numeric: true, sensitivity: "base" }),
    );
}

/** Loads months 1..month for the target year in parallel and builds ExportSlip items for PDF/Excel slip output. */
export async function createHrmPeriodSlips(
  year: number,
  month: number,
  employeeIds?: string[],
): Promise<{ payroll: Payroll; items: ExportSlip[] }> {
  const months = Array.from({ length: month }, (_, index) => index + 1);
  const monthlyPayrolls = await Promise.all(
    months.map((m) => createPayroll(year, m, { includePreviousComparison: false })),
  );
  const targetPayroll = monthlyPayrolls.find((item) => item.month === month)
    ?? await createPayroll(year, month, { includePreviousComparison: false });
  const items = buildHrmExportSlips(monthlyPayrolls, year, month, employeeIds);
  return { payroll: targetPayroll, items };
}
