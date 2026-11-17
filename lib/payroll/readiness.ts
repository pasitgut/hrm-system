import type { PayrollRow } from "./types";

const MAX_ROWS_IN_MESSAGE = 10;

/** Why a row has no net pay (so it cannot be exported). */
function issuesFor(row: PayrollRow): string[] {
  return [
    row.baseSalary == null ? "ไม่มีเงินเดือน" : "",
    row.workHoursPerDay <= 0 ? "ไม่มีชั่วโมงทำงานต่อวัน" : "",
    row.unpricedItems.length ? `รายการหน่วยไม่ใช่งวด: ${row.unpricedItems.map((item) => item.label).join("/")}` : "",
  ].filter(Boolean);
}

/** A Thai message listing the rows that block the export, or null when every row is priced. */
export function describeIncompleteRows(rows: PayrollRow[]): string | null {
  const incomplete = rows.filter((row) => row.netPay == null);
  if (incomplete.length === 0) return null;
  const reasons = incomplete.slice(0, MAX_ROWS_IN_MESSAGE).map((row) => `${row.code} (${issuesFor(row).join(", ")})`);
  return `ยังส่งออกไม่ได้ กรุณาตรวจข้อมูล: ${reasons.join("; ")}`;
}
