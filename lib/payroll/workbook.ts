import ExcelJS from "exceljs";
import type { Payroll } from "./types";

const SESSION_LABELS: Record<string, string> = { full: "เต็มวัน", am: "ครึ่งวันเช้า", pm: "ครึ่งวันบ่าย" };
const MONEY_FORMAT = "#,##0.00";
const HOURS_FORMAT = "0.00";

type Column = { header: string; key: string; width: number };

function periodTitle(payroll: Payroll) {
  return `รอบเงินเดือน ${payroll.year}-${String(payroll.month).padStart(2, "0")} · ${payroll.periodStart} ถึง ${payroll.periodEnd}`;
}

/** Adds the bold period title above the column headers, freezes both rows and turns on filtering. */
function finishSheet(sheet: ExcelJS.Worksheet, title: string, columnCount: number) {
  sheet.insertRow(1, [title]);
  sheet.mergeCells(1, 1, 1, columnCount);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(2).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 2 }];
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(sheet.rowCount, 2), column: columnCount } };
}

const EMPLOYEE_COLUMNS: Column[] = [
  { header: "รหัสพนักงาน", key: "code", width: 14 },
  { header: "ชื่อ-นามสกุล", key: "name", width: 28 },
];

const SUMMARY_COLUMNS: Column[] = [
  ...EMPLOYEE_COLUMNS,
  { header: "แผนก", key: "department", width: 22 }, { header: "ธนาคาร", key: "bankName", width: 20 },
  { header: "เลขที่บัญชี", key: "bankAccount", width: 22 }, { header: "เงินเดือน", key: "baseSalary", width: 16 },
  { header: "OT วันธรรมดา (ชม.)", key: "weekdayOtHours", width: 18 }, { header: "OT วันหยุด (ชม.)", key: "holidayOtHours", width: 18 },
  { header: "ค่าล่วงเวลา", key: "otAmount", width: 16 },
  { header: "OT รออนุมัติ (ชม.)", key: "pendingOtHours", width: 20 }, { header: "คำขอ OT รออนุมัติ", key: "pendingOtRequests", width: 18 },
  { header: "คำขอลาที่อนุมัติ", key: "approvedLeaveRequests", width: 18 }, { header: "รวมรายได้", key: "incomeTotal", width: 16 },
  { header: "รวมรายหัก", key: "deductionTotal", width: 16 }, { header: "รับสุทธิ", key: "netPay", width: 16 },
];
const SUMMARY_MONEY_KEYS = ["baseSalary", "otAmount", "incomeTotal", "deductionTotal", "netPay"];
const SUMMARY_HOURS_KEYS = ["weekdayOtHours", "holidayOtHours", "pendingOtHours"];

// Formats are applied by column key (not position) so adding or removing a column cannot misalign them.
function formatColumns(sheet: ExcelJS.Worksheet, keys: string[], numFmt: string) {
  for (const key of keys) sheet.getColumn(key).numFmt = numFmt;
}

function addSummarySheet(workbook: ExcelJS.Workbook, payroll: Payroll) {
  const sheet = workbook.addWorksheet("สรุปเงินเดือน");
  sheet.columns = SUMMARY_COLUMNS;
  sheet.addRows(payroll.rows);
  finishSheet(sheet, periodTitle(payroll), SUMMARY_COLUMNS.length);
  formatColumns(sheet, SUMMARY_MONEY_KEYS, MONEY_FORMAT);
  formatColumns(sheet, SUMMARY_HOURS_KEYS, HOURS_FORMAT);
}

const LINE_COLUMNS: Column[] = [
  ...EMPLOYEE_COLUMNS,
  { header: "ประเภท", key: "type", width: 16 }, { header: "รายการ", key: "label", width: 30 },
  { header: "จำนวนเงิน", key: "amount", width: 18 },
];

function addIncomeDeductionSheet(workbook: ExcelJS.Workbook, payroll: Payroll) {
  const sheet = workbook.addWorksheet("รายการรายรับรายหัก");
  sheet.columns = LINE_COLUMNS;
  for (const row of payroll.rows) {
    for (const item of row.incomes) sheet.addRow({ code: row.code, name: row.name, type: "รายได้", ...item });
    for (const item of row.deductions) sheet.addRow({ code: row.code, name: row.name, type: "รายหัก", ...item });
  }
  finishSheet(sheet, periodTitle(payroll), LINE_COLUMNS.length);
  formatColumns(sheet, ["amount"], MONEY_FORMAT);
}

const LEAVE_COLUMNS: Column[] = [
  ...EMPLOYEE_COLUMNS,
  { header: "ประเภทการลา", key: "type", width: 24 }, { header: "ตั้งแต่วันที่", key: "startOn", width: 16 },
  { header: "ถึงวันที่", key: "endOn", width: 16 }, { header: "ช่วงเวลา", key: "session", width: 16 },
];

function addLeaveSheet(workbook: ExcelJS.Workbook, payroll: Payroll) {
  const sheet = workbook.addWorksheet("วันลาที่อนุมัติ");
  sheet.columns = LEAVE_COLUMNS;
  for (const row of payroll.rows) {
    for (const leave of row.approvedLeaves) {
      sheet.addRow({ code: row.code, name: row.name, ...leave, session: SESSION_LABELS[leave.session] ?? SESSION_LABELS.pm });
    }
  }
  finishSheet(sheet, periodTitle(payroll), LEAVE_COLUMNS.length);
}

/** The payroll export: one summary sheet, the income/deduction lines, and the approved leave. */
export function createPayrollWorkbook(payroll: Payroll) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRM";
  addSummarySheet(workbook, payroll);
  addIncomeDeductionSheet(workbook, payroll);
  addLeaveSheet(workbook, payroll);
  return workbook;
}
