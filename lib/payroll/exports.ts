import ExcelJS from "exceljs";
import { money } from "./calculate";
import type { Payroll, PayrollRow } from "./types";

const MONEY_FORMAT = "#,##0.00";

export type PayrollReportFilterOptions = {
  departments?: string[];
  employeeId?: string;
  sortBy?: "code" | "name" | "department";
  filingType?: "normal" | "additional";
};

export function filterAndSortPayrollRows(
  rows: PayrollRow[],
  options: PayrollReportFilterOptions = {},
): PayrollRow[] {
  const deptSet = options.departments && options.departments.length > 0
    ? new Set(options.departments.map((item) => item.trim()).filter(Boolean))
    : null;

  const filtered = rows.filter((row) => {
    if (options.employeeId && row.employeeId !== options.employeeId) return false;
    if (deptSet && !deptSet.has(row.department || "ไม่ระบุแผนก")) return false;
    return true;
  });

  const sortBy = options.sortBy ?? "code";
  return [...filtered].sort((left, right) => {
    if (sortBy === "name") {
      return left.name.localeCompare(right.name, "th-TH", { sensitivity: "base" })
        || left.code.localeCompare(right.code, "th-TH", { numeric: true });
    }
    if (sortBy === "department") {
      return (left.department || "").localeCompare(right.department || "", "th-TH", { sensitivity: "base" })
        || left.code.localeCompare(right.code, "th-TH", { numeric: true });
    }
    return left.code.localeCompare(right.code, "th-TH", { numeric: true, sensitivity: "base" });
  });
}

function csvEscape(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function periodCode(payroll: Payroll): string {
  return `${payroll.year}-${String(payroll.month).padStart(2, "0")}`;
}

function thaiPeriodLabel(payroll: Payroll): string {
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(payroll.year, payroll.month - 1, 1)),
  );
}

function filingTypeLabel(filingType?: "normal" | "additional"): string {
  return filingType === "additional" ? "ยื่นเพิ่มเติม" : "ยื่นปกติ";
}

/** Balanced General Ledger journal entries (Dr === Cr) for the payroll period, UTF-8 with BOM CSV. */
export function createGlJournalCsv(payroll: Payroll): Buffer {
  const { summary } = payroll;
  const period = periodCode(payroll);
  const descriptionPrefix = `บันทึกเงินเดือนงวด ${period}`;

  const entries: Array<{ accountCode: string; accountName: string; debit: number; credit: number; memo: string }> = [
    { accountCode: "5110-01", accountName: "เงินเดือนพนักงาน", debit: summary.costBreakdown.baseSalary, credit: 0, memo: descriptionPrefix },
    { accountCode: "5110-02", accountName: "ค่าล่วงเวลา (OT)", debit: summary.costBreakdown.overtime, credit: 0, memo: descriptionPrefix },
    { accountCode: "5110-03", accountName: "โบนัสและค่าตอบแทน", debit: summary.costBreakdown.incentives, credit: 0, memo: descriptionPrefix },
    { accountCode: "5110-04", accountName: "สวัสดิการและเบี้ยเลี้ยง", debit: summary.costBreakdown.allowances, credit: 0, memo: descriptionPrefix },
    { accountCode: "5120-01", accountName: "เงินสมทบประกันสังคม (นายจ้าง)", debit: summary.employerSocialSecurityTotal, credit: 0, memo: descriptionPrefix },
    { accountCode: "2130-01", accountName: "ภาษีหัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด.1)", debit: 0, credit: summary.taxTotal, memo: descriptionPrefix },
    {
      accountCode: "2130-02",
      accountName: "เงินสมทบประกันสังคมค้างจ่าย (ลูกจ้าง+นายจ้าง)",
      debit: 0,
      credit: money(summary.socialSecurityTotal + summary.employerSocialSecurityTotal),
      memo: descriptionPrefix,
    },
    { accountCode: "2130-03", accountName: "รายการหักอื่นค้างจ่าย", debit: 0, credit: summary.otherDeductionsTotal, memo: descriptionPrefix },
    { accountCode: "2120-01", accountName: "เงินเดือนค้างจ่ายสุทธิ (Net Pay)", debit: 0, credit: summary.netTotal, memo: descriptionPrefix },
  ].filter((entry) => entry.debit !== 0 || entry.credit !== 0);

  const headers = ["งวดบัญชี", "วันที่จ่าย", "รหัสบัญชี", "ชื่อบัญชี", "เดบิต (Debit)", "เครดิต (Credit)", "คำอธิบายรายการ"];
  const lines = [
    headers.map(csvEscape).join(","),
    ...entries.map((entry) => [
      period,
      payroll.payDate,
      entry.accountCode,
      entry.accountName,
      entry.debit.toFixed(2),
      entry.credit.toFixed(2),
      entry.memo,
    ].map(csvEscape).join(",")),
  ];

  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

/** Bank transfer text file for payroll batches. */
export function createBankTransferTxt(payroll: Payroll, options: PayrollReportFilterOptions = {}): Buffer {
  const payableRows = filterAndSortPayrollRows(payroll.rows, options).filter((row) => (row.netPay ?? 0) > 0);
  const totalNet = money(payableRows.reduce((sum, row) => sum + (row.netPay ?? 0), 0));
  const lines = [
    `H|${payroll.companyName}|${payroll.payDate}|${payableRows.length}|${totalNet.toFixed(2)}`,
    ...payableRows.map((row, index) => [
      "D",
      String(index + 1).padStart(4, "0"),
      row.code,
      row.bankName || "-",
      row.bankAccount || "-",
      row.name,
      (row.netPay ?? 0).toFixed(2),
    ].join("|")),
    `T|${payableRows.length}|${totalNet.toFixed(2)}`,
  ];
  return Buffer.from(`${lines.join("\r\n")}\r\n`, "utf8");
}

/** Excel version of นำส่งเงินเดือนธนาคาร (.xlsx). */
export function createBankTransferWorkbook(
  payroll: Payroll,
  options: PayrollReportFilterOptions = {},
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRM";
  const sheet = workbook.addWorksheet("นำส่งเงินเดือนธนาคาร");

  sheet.columns = [
    { header: "ลำดับ", key: "seq", width: 8 },
    { header: "รหัสพนักงาน", key: "code", width: 14 },
    { header: "ชื่อ-นามสกุล", key: "name", width: 26 },
    { header: "แผนก", key: "department", width: 18 },
    { header: "ธนาคาร", key: "bankName", width: 22 },
    { header: "เลขที่บัญชี", key: "bankAccount", width: 20 },
    { header: "ยอดโอนสุทธิ (บาท)", key: "netPay", width: 18 },
  ];

  const rows = filterAndSortPayrollRows(payroll.rows, options).filter((row) => (row.netPay ?? 0) > 0);
  rows.forEach((row, index) => {
    sheet.addRow({
      seq: index + 1,
      code: row.code,
      name: row.name,
      department: row.department,
      bankName: row.bankName || "",
      bankAccount: row.bankAccount || "",
      netPay: row.netPay ?? 0,
    });
  });

  const totalNet = money(rows.reduce((sum, row) => sum + (row.netPay ?? 0), 0));
  const totalRow = sheet.addRow({
    seq: "",
    code: "รวม",
    name: `${rows.length} รายการ`,
    department: "",
    bankName: "",
    bankAccount: "",
    netPay: totalNet,
  });

  sheet.insertRow(1, [`รายการนำส่งเงินเดือนเข้าบัญชีธนาคาร · ${thaiPeriodLabel(payroll)} · วันจ่าย ${payroll.payDate} · ${payroll.companyName}`]);
  sheet.mergeCells(1, 1, 1, 7);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(2).font = { bold: true };
  totalRow.font = { bold: true };
  sheet.getColumn("bankAccount").numFmt = "@";
  sheet.getColumn("netPay").numFmt = MONEY_FORMAT;
  sheet.views = [{ state: "frozen", ySplit: 2 }];
  return workbook;
}

/** ภ.ง.ด.1 withholding tax return workbook. */
export function createPnd1Workbook(payroll: Payroll, options: PayrollReportFilterOptions = {}): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRM";
  const sheet = workbook.addWorksheet("ภ.ง.ด.1");

  sheet.columns = [
    { header: "ลำดับ", key: "seq", width: 8 },
    { header: "เลขประจำตัวประชาชน", key: "citizenId", width: 20 },
    { header: "รหัสพนักงาน", key: "code", width: 14 },
    { header: "คำนำหน้า", key: "prefix", width: 12 },
    { header: "ชื่อ", key: "firstName", width: 20 },
    { header: "นามสกุล", key: "lastName", width: 22 },
    { header: "แผนก", key: "department", width: 18 },
    { header: "วันที่จ่าย", key: "payDate", width: 14 },
    { header: "เงินได้พึงประเมิน 40(1)", key: "assessableIncome", width: 22 },
    { header: "ภาษีหัก ณ ที่จ่าย", key: "taxAmount", width: 18 },
    { header: "เงื่อนไขการหัก", key: "taxCondition", width: 16 },
  ];

  const assessableRows = filterAndSortPayrollRows(payroll.rows, options).filter((row) => row.incomeTotal != null);
  assessableRows.forEach((row, index) => {
    sheet.addRow({
      seq: index + 1,
      citizenId: row.citizenId || "",
      code: row.code,
      prefix: row.prefix || "",
      firstName: row.firstName,
      lastName: row.lastName,
      department: row.department,
      payDate: payroll.payDate,
      assessableIncome: row.incomeTotal ?? 0,
      taxAmount: row.taxAmount,
      taxCondition: row.taxCondition === "no_withholding" ? "0" : "1",
    });
  });

  const totalIncome = money(assessableRows.reduce((sum, row) => sum + (row.incomeTotal ?? 0), 0));
  const totalTax = money(assessableRows.reduce((sum, row) => sum + row.taxAmount, 0));
  const totalRow = sheet.addRow({
    seq: "",
    citizenId: "รวมทั้งหมด",
    code: "",
    prefix: "",
    firstName: "",
    lastName: "",
    department: "",
    payDate: "",
    assessableIncome: totalIncome,
    taxAmount: totalTax,
    taxCondition: "",
  });

  sheet.insertRow(1, [`แบบรายการภาษีเงินได้หัก ณ ที่จ่าย (ภ.ง.ด.1 · ${filingTypeLabel(options.filingType)}) · ${thaiPeriodLabel(payroll)} · ${payroll.companyName}`]);
  sheet.mergeCells(1, 1, 1, 11);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(2).font = { bold: true };
  totalRow.font = { bold: true };
  sheet.getColumn("citizenId").numFmt = "@";
  sheet.getColumn("assessableIncome").numFmt = MONEY_FORMAT;
  sheet.getColumn("taxAmount").numFmt = MONEY_FORMAT;
  sheet.views = [{ state: "frozen", ySplit: 2 }];
  return workbook;
}

/** สปส.1-10 (ส่วนที่ 1 และส่วนที่ 2) Social Security contribution workbook. */
export function createSso110Workbook(payroll: Payroll, options: PayrollReportFilterOptions = {}): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRM";
  const periodTitle = `รายการแสดงนำส่งเงินสมทบ (สปส.1-10 · ${filingTypeLabel(options.filingType)}) · ${thaiPeriodLabel(payroll)} · ${payroll.companyName}`;

  const insuredRows = filterAndSortPayrollRows(payroll.rows, options).filter((row) => row.incomeTotal != null);
  const totalWages = money(insuredRows.reduce((sum, row) => sum + (row.incomeTotal ?? 0), 0));
  const totalEmployeeSso = money(insuredRows.reduce((sum, row) => sum + row.socialSecurityAmount, 0));
  const totalEmployerSso = money(insuredRows.reduce((sum, row) => sum + row.employerSocialSecurity, 0));

  const part1 = workbook.addWorksheet("สปส.1-10 ส่วนที่ 1");
  part1.columns = [
    { header: "รายการสรุป", key: "label", width: 42 },
    { header: "จำนวน / ยอดเงิน", key: "value", width: 22 },
  ];
  part1.addRows([
    { label: "สถานประกอบการ", value: payroll.companyName },
    { label: "งวดค่าจ้าง", value: thaiPeriodLabel(payroll) },
    { label: "ประเภทการยื่น", value: filingTypeLabel(options.filingType) },
    { label: "จำนวนผู้ประกันตน (คน)", value: insuredRows.length },
    { label: "ค่าจ้างรวมทั้งสิ้น (บาท)", value: totalWages },
    { label: "เงินสมทบส่วนของลูกจ้าง (บาท)", value: totalEmployeeSso },
    { label: "เงินสมทบส่วนของนายจ้าง (บาท)", value: totalEmployerSso },
    { label: "รวมเงินสมทบที่ต้องนำส่งทั้งสิ้น (บาท)", value: money(totalEmployeeSso + totalEmployerSso) },
  ]);
  part1.insertRow(1, [periodTitle]);
  part1.mergeCells(1, 1, 1, 2);
  part1.getRow(1).font = { bold: true };
  part1.getRow(2).font = { bold: true };
  for (let rowIndex = 7; rowIndex <= 10; rowIndex += 1) {
    part1.getCell(`B${rowIndex}`).numFmt = MONEY_FORMAT;
  }

  const part2 = workbook.addWorksheet("สปส.1-10 ส่วนที่ 2");
  part2.columns = [
    { header: "ลำดับ", key: "seq", width: 8 },
    { header: "เลขบัตรประชาชน", key: "citizenId", width: 20 },
    { header: "คำนำหน้า", key: "prefix", width: 12 },
    { header: "ชื่อ", key: "firstName", width: 20 },
    { header: "นามสกุล", key: "lastName", width: 22 },
    { header: "แผนก", key: "department", width: 18 },
    { header: "ค่าจ้าง", key: "wage", width: 18 },
    { header: "เงินสมทบลูกจ้าง", key: "employeeSso", width: 18 },
    { header: "เงินสมทบนายจ้าง", key: "employerSso", width: 18 },
  ];
  insuredRows.forEach((row, index) => {
    part2.addRow({
      seq: index + 1,
      citizenId: row.citizenId || "",
      prefix: row.prefix || "",
      firstName: row.firstName,
      lastName: row.lastName,
      department: row.department,
      wage: row.incomeTotal ?? 0,
      employeeSso: row.socialSecurityAmount,
      employerSso: row.employerSocialSecurity,
    });
  });
  part2.insertRow(1, [periodTitle]);
  part2.mergeCells(1, 1, 1, 9);
  part2.getRow(1).font = { bold: true };
  part2.getRow(2).font = { bold: true };
  part2.getColumn("citizenId").numFmt = "@";
  part2.getColumn("wage").numFmt = MONEY_FORMAT;
  part2.getColumn("employeeSso").numFmt = MONEY_FORMAT;
  part2.getColumn("employerSso").numFmt = MONEY_FORMAT;
  part2.views = [{ state: "frozen", ySplit: 2 }];

  return workbook;
}

const SHORT_MONTH_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"] as const;
const SHORT_MONTH_HEADERS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** กท.20 ก annual Workmen's Compensation Fund wage summary across 12 months. */
export function createKt20kWorkbook(
  yearlyPayrolls: Payroll[],
  options: PayrollReportFilterOptions = {},
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRM";
  const sheet = workbook.addWorksheet("กท.20 ก");
  const targetYear = yearlyPayrolls[0]?.year ?? new Date().getFullYear();
  const companyName = yearlyPayrolls[0]?.companyName ?? "บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด";

  sheet.columns = [
    { header: "ลำดับ", key: "seq", width: 8 },
    { header: "รหัสพนักงาน", key: "code", width: 12 },
    { header: "ชื่อ-นามสกุล", key: "name", width: 26 },
    { header: "แผนก", key: "department", width: 18 },
    ...SHORT_MONTH_KEYS.map((key, idx) => ({ header: SHORT_MONTH_HEADERS[idx], key, width: 13 })),
    { header: "รวมค่าจ้างทั้งปี", key: "annualTotal", width: 18 },
  ];

  const byEmployee = new Map<string, { meta: PayrollRow; months: Record<string, number>; annualTotal: number }>();
  for (const period of yearlyPayrolls) {
    const filtered = filterAndSortPayrollRows(period.rows, options);
    for (const row of filtered) {
      if (row.incomeTotal == null) continue;
      const entry = byEmployee.get(row.employeeId) ?? {
        meta: row,
        months: Object.fromEntries(SHORT_MONTH_KEYS.map((key) => [key, 0])),
        annualTotal: 0,
      };
      const mKey = `m${period.month}`;
      entry.months[mKey] = money((entry.months[mKey] ?? 0) + row.incomeTotal);
      entry.annualTotal = money(entry.annualTotal + row.incomeTotal);
      byEmployee.set(row.employeeId, entry);
    }
  }

  const ordered = filterAndSortPayrollRows(
    [...byEmployee.values()].map((item) => item.meta),
    options,
  );
  const grandTotals: Record<string, number> = Object.fromEntries(
    [...SHORT_MONTH_KEYS, "annualTotal"].map((k) => [k, 0]),
  );

  ordered.forEach((meta, idx) => {
    const data = byEmployee.get(meta.employeeId)!;
    sheet.addRow({
      seq: idx + 1,
      code: meta.code,
      name: meta.name,
      department: meta.department,
      ...data.months,
      annualTotal: data.annualTotal,
    });
    for (const k of SHORT_MONTH_KEYS) {
      grandTotals[k] = money(grandTotals[k] + data.months[k]);
    }
    grandTotals.annualTotal = money(grandTotals.annualTotal + data.annualTotal);
  });

  const totalRow = sheet.addRow({
    seq: "",
    code: "รวม",
    name: `${ordered.length} คน`,
    department: "",
    ...grandTotals,
  });

  sheet.insertRow(1, [`รายงานค่าจ้างประจำปีตามแบบ กท.20 ก · ปี พ.ศ. ${targetYear + 543} · ${companyName}`]);
  sheet.mergeCells(1, 1, 1, 17);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(2).font = { bold: true };
  totalRow.font = { bold: true };
  for (const key of [...SHORT_MONTH_KEYS, "annualTotal"]) {
    sheet.getColumn(key).numFmt = MONEY_FORMAT;
  }
  sheet.views = [{ state: "frozen", ySplit: 2 }];
  return workbook;
}

/** ภ.ง.ด.1ก annual withholding tax & statutory deduction summary across the year. */
export function createPnd1kWorkbook(
  yearlyPayrolls: Payroll[],
  options: PayrollReportFilterOptions = {},
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRM";
  const sheet = workbook.addWorksheet("ภ.ง.ด.1ก");
  const targetYear = yearlyPayrolls[0]?.year ?? new Date().getFullYear();
  const companyName = yearlyPayrolls[0]?.companyName ?? "บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด";

  sheet.columns = [
    { header: "ลำดับ", key: "seq", width: 8 },
    { header: "เลขประจำตัวประชาชน", key: "citizenId", width: 20 },
    { header: "รหัสพนักงาน", key: "code", width: 14 },
    { header: "คำนำหน้า", key: "prefix", width: 12 },
    { header: "ชื่อ", key: "firstName", width: 20 },
    { header: "นามสกุล", key: "lastName", width: 22 },
    { header: "แผนก", key: "department", width: 18 },
    { header: "เงินได้สะสมทั้งปี", key: "annualIncome", width: 18 },
    { header: "ภาษีหัก ณ ที่จ่ายสะสม", key: "annualTax", width: 20 },
    { header: "ประกันสังคมสะสม", key: "annualSso", width: 18 },
    { header: "ก.สำรองเลี้ยงชีพสะสม", key: "annualPvd", width: 20 },
  ];

  const byEmployee = new Map<string, { meta: PayrollRow; annualIncome: number; annualTax: number; annualSso: number; annualPvd: number }>();
  for (const period of yearlyPayrolls) {
    const filtered = filterAndSortPayrollRows(period.rows, options);
    for (const row of filtered) {
      if (row.incomeTotal == null) continue;
      const entry = byEmployee.get(row.employeeId) ?? {
        meta: row,
        annualIncome: 0,
        annualTax: 0,
        annualSso: 0,
        annualPvd: 0,
      };
      entry.annualIncome = money(entry.annualIncome + row.incomeTotal);
      entry.annualTax = money(entry.annualTax + row.taxAmount);
      entry.annualSso = money(entry.annualSso + row.socialSecurityAmount);
      entry.annualPvd = money(entry.annualPvd + row.providentFundAmount);
      byEmployee.set(row.employeeId, entry);
    }
  }

  const ordered = filterAndSortPayrollRows(
    [...byEmployee.values()].map((item) => item.meta),
    options,
  );
  let totalIncome = 0;
  let totalTax = 0;
  let totalSso = 0;
  let totalPvd = 0;

  ordered.forEach((meta, idx) => {
    const data = byEmployee.get(meta.employeeId)!;
    sheet.addRow({
      seq: idx + 1,
      citizenId: meta.citizenId || "",
      code: meta.code,
      prefix: meta.prefix || "",
      firstName: meta.firstName,
      lastName: meta.lastName,
      department: meta.department,
      annualIncome: data.annualIncome,
      annualTax: data.annualTax,
      annualSso: data.annualSso,
      annualPvd: data.annualPvd,
    });
    totalIncome = money(totalIncome + data.annualIncome);
    totalTax = money(totalTax + data.annualTax);
    totalSso = money(totalSso + data.annualSso);
    totalPvd = money(totalPvd + data.annualPvd);
  });

  const totalRow = sheet.addRow({
    seq: "",
    citizenId: "รวมทั้งหมด",
    code: "",
    prefix: "",
    firstName: "",
    lastName: "",
    department: "",
    annualIncome: totalIncome,
    annualTax: totalTax,
    annualSso: totalSso,
    annualPvd: totalPvd,
  });

  sheet.insertRow(1, [`แบบสรุปรายการภาษีเงินได้หัก ณ ที่จ่ายประจำปี (ภ.ง.ด.1ก) · ปี พ.ศ. ${targetYear + 543} · ${companyName}`]);
  sheet.mergeCells(1, 1, 1, 11);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(2).font = { bold: true };
  totalRow.font = { bold: true };
  sheet.getColumn("citizenId").numFmt = "@";
  sheet.getColumn("annualIncome").numFmt = MONEY_FORMAT;
  sheet.getColumn("annualTax").numFmt = MONEY_FORMAT;
  sheet.getColumn("annualSso").numFmt = MONEY_FORMAT;
  sheet.getColumn("annualPvd").numFmt = MONEY_FORMAT;
  sheet.views = [{ state: "frozen", ySplit: 2 }];
  return workbook;
}
