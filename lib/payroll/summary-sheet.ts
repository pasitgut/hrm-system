import ExcelJS from "exceljs";
import { createPdfMakeBuffer } from "@/lib/pdfmake/server";
import { money } from "./calculate";
import { filterAndSortPayrollRows, type PayrollReportFilterOptions } from "./exports";
import type { Payroll, PayrollRow } from "./types";

const MONEY_FORMAT = "#,##0.00";

export type SummarySheetEmployeeEntry = {
  seq: number;
  code: string;
  fullName: string;
  department: string;
  baseSalary: number;
  dailyRate: number;
  workingDays: number | null;
  dailyWageTotal: number;
  ot1x: number;
  ot15x: number;
  ot2x: number;
  housing: number;
  phone: number;
  license: number;
  incomeTotal: number;
  sso: number;
  loan: number;
  netPay: number;
  remark: string;
  isCash: boolean;
};

export type SummarySheetTotals = {
  baseSalary: number;
  dailyWageTotal: number;
  ot1x: number;
  ot15x: number;
  ot2x: number;
  housing: number;
  phone: number;
  license: number;
  incomeTotal: number;
  sso: number;
  loan: number;
  netPay: number;
};

export type SummarySheetDepartmentGroup = {
  department: string;
  subtotalLabel: string;
  rows: SummarySheetEmployeeEntry[];
  subtotal: SummarySheetTotals;
};

export type PayrollSummarySheetModel = {
  title: string;
  sheetName: string;
  periodSlug: string;
  groups: SummarySheetDepartmentGroup[];
  grandTotalNetPay: number;
  cashDeductedTotal: number;
  directPayrollTotal: number;
};

function emptyTotals(): SummarySheetTotals {
  return {
    baseSalary: 0,
    dailyWageTotal: 0,
    ot1x: 0,
    ot15x: 0,
    ot2x: 0,
    housing: 0,
    phone: 0,
    license: 0,
    incomeTotal: 0,
    sso: 0,
    loan: 0,
    netPay: 0,
  };
}

function addTotals(acc: SummarySheetTotals, row: SummarySheetEmployeeEntry) {
  acc.baseSalary = money(acc.baseSalary + row.baseSalary);
  acc.dailyWageTotal = money(acc.dailyWageTotal + row.dailyWageTotal);
  acc.ot1x = money(acc.ot1x + row.ot1x);
  acc.ot15x = money(acc.ot15x + row.ot15x);
  acc.ot2x = money(acc.ot2x + row.ot2x);
  acc.housing = money(acc.housing + row.housing);
  acc.phone = money(acc.phone + row.phone);
  acc.license = money(acc.license + row.license);
  acc.incomeTotal = money(acc.incomeTotal + row.incomeTotal);
  acc.sso = money(acc.sso + row.sso);
  acc.loan = money(acc.loan + row.loan);
  acc.netPay = money(acc.netPay + row.netPay);
}

function formatDepartmentSubtotalLabel(dept: string): string {
  const trimmed = dept.trim();
  if (!trimmed || trimmed === "ไม่ระบุแผนก") return "ไม่ระบุแผนก";
  return trimmed.startsWith("แผนก") ? trimmed : `แผนก${trimmed}`;
}

function formatDisplayName(row: PayrollRow): string {
  const prefix = (row.prefix || "").trim();
  const name = row.name.trim();
  if (!prefix) return name;
  return name.startsWith(prefix) ? name : `${prefix}${name}`;
}

function formatNumber(value: number, showZero = false): string {
  if (!showZero && value === 0) return "";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Builds the grouped department payroll summary model matching the TJARUSCH_PAYROLL_YYYY-MM-01 layout.
 */
export function buildPayrollSummarySheetModel(
  payroll: Payroll,
  options: PayrollReportFilterOptions = {},
): PayrollSummarySheetModel {
  const mm = String(payroll.month).padStart(2, "0");
  const periodSlug = `${payroll.year}-${mm}-01`;
  const title = `TJARUSCH_PAYROLL_${periodSlug}`;
  const sheetName = `TJARUSCH_PAYROLL_${payroll.year}-${mm}`;

  const sortedRows = filterAndSortPayrollRows(payroll.rows, options);
  const groupedMap = new Map<string, PayrollRow[]>();
  for (const row of sortedRows) {
    const dept = (row.department || "").trim() || "ไม่ระบุแผนก";
    const list = groupedMap.get(dept) ?? [];
    list.push(row);
    groupedMap.set(dept, list);
  }

  const orderedDepts = [...groupedMap.keys()].sort((a, b) => a.localeCompare(b, "th-TH"));
  let seq = 0;
  let grandTotalNetPay = 0;
  let cashDeductedTotal = 0;

  const groups: SummarySheetDepartmentGroup[] = orderedDepts.map((department) => {
    const deptRows = groupedMap.get(department)!;
    const subtotal = emptyTotals();
    const entries: SummarySheetEmployeeEntry[] = deptRows.map((row) => {
      seq += 1;
      const isCash = row.paymentMethod === "cash";
      const baseSalary = money(row.incomeBreakdown?.INT001 ?? row.baseSalary ?? 0);
      const dailyRate = money(row.dailyRate ?? 0);
      const dailyWageTotal = money(row.dailyWageTotal ?? 0);
      const ot1x = money(row.ot1xAmount ?? 0);
      const ot15x = money(row.weekdayOtAmount ?? 0);
      const ot2x = money(row.holidayOtAmount ?? 0);
      const housing = money(row.incomeBreakdown?.INT19 ?? 0);
      const phone = money(row.incomeBreakdown?.Tel ?? 0);
      const license = money(row.incomeBreakdown?.license ?? 0);
      const incomeTotal = money(row.incomeTotal ?? 0);
      const sso = money(row.deductionBreakdown?.SYS001 ?? row.socialSecurityAmount ?? 0);
      const loan = money(row.deductionBreakdown?.DDT009 ?? 0);
      const netPay = money(row.netPay ?? 0);
      const remark = row.remark || (isCash ? "เงินสด" : "");

      const entry: SummarySheetEmployeeEntry = {
        seq,
        code: row.code,
        fullName: formatDisplayName(row),
        department,
        baseSalary,
        dailyRate,
        workingDays: row.workingDays ?? null,
        dailyWageTotal,
        ot1x,
        ot15x,
        ot2x,
        housing,
        phone,
        license,
        incomeTotal,
        sso,
        loan,
        netPay,
        remark,
        isCash,
      };
      addTotals(subtotal, entry);
      grandTotalNetPay = money(grandTotalNetPay + netPay);
      if (isCash) cashDeductedTotal = money(cashDeductedTotal + netPay);
      return entry;
    });

    return {
      department,
      subtotalLabel: formatDepartmentSubtotalLabel(department),
      rows: entries,
      subtotal,
    };
  });

  return {
    title,
    sheetName,
    periodSlug,
    groups,
    grandTotalNetPay,
    cashDeductedTotal,
    directPayrollTotal: money(grandTotalNetPay - cashDeductedTotal),
  };
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF404040" } },
  left: { style: "thin", color: { argb: "FF404040" } },
  bottom: { style: "thin", color: { argb: "FF404040" } },
  right: { style: "thin", color: { argb: "FF404040" } },
};

const NAME_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
const SUBTOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
const YELLOW_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
const OT2_MUTED_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };

/** Creates the 18-column grouped TJARUSCH_PAYROLL Excel workbook (.xlsx). */
export function createPayrollSummarySheetWorkbook(
  payroll: Payroll,
  options: PayrollReportFilterOptions = {},
): ExcelJS.Workbook {
  const model = buildPayrollSummarySheetModel(payroll, options);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRM";
  const sheet = workbook.addWorksheet(model.sheetName);

  const colWidths = [7, 9, 26, 13, 10, 12, 11, 10, 11, 11, 11, 11, 11, 13, 11, 12, 13, 11];
  colWidths.forEach((width, idx) => {
    sheet.getColumn(idx + 1).width = width;
  });

  // Row 1: Title
  sheet.mergeCells("A1:R1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = model.title;
  titleCell.font = { name: "Tahoma", size: 12, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 24;

  // Rows 2-4: 3-tier merged headers
  const headerMerges = [
    "A2:A4", "B2:B4", "C2:C4",
    "D2:M2", "D3:D4", "E3:G3", "H3:J3", "K3:K4", "L3:L4", "M3:M4",
    "N2:N4", "O2:P2", "O3:O4", "P3:P4", "Q2:Q4", "R2:R4",
  ];
  for (const range of headerMerges) sheet.mergeCells(range);

  const headerValues: Array<[string, string]> = [
    ["A2", "ลำดับ"],
    ["B2", "รหัส"],
    ["C2", "ชื่อ - นามสกุล"],
    ["D2", "รายการเงินได้"],
    ["D3", "เงินเดือน"],
    ["E3", "ค่าแรงรายวัน"],
    ["E4", "วันละ"],
    ["F4", "จน.วันที่\nทำงาน"],
    ["G4", "จำนวน"],
    ["H3", "ค่าล่วงเวลา OT"],
    ["H4", "OT x1"],
    ["I4", "OT x1.5"],
    ["J4", "OT x2"],
    ["K3", "ค่าที่พัก"],
    ["L3", "ค่า\nโทรศัพท์"],
    ["M3", "ค่าใบกว"],
    ["N2", "รวมรายได้"],
    ["O2", "รายการหัก"],
    ["O3", "ประกัน\nสังคม"],
    ["P3", "กองทุนกู้\nยืม"],
    ["Q2", "จ่ายเงินสุทธิ"],
    ["R2", "หมายเหตุ"],
  ];
  for (const [address, label] of headerValues) {
    sheet.getCell(address).value = label;
  }

  for (let r = 2; r <= 4; r += 1) {
    const row = sheet.getRow(r);
    row.height = r === 4 ? 26 : 18;
    for (let c = 1; c <= 18; c += 1) {
      const cell = row.getCell(c);
      cell.font = { name: "Tahoma", size: 9, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = THIN_BORDER;
    }
  }

  let currentRow = 5;
  for (const group of model.groups) {
    const groupHasOt2 = group.rows.some((r) => r.ot2x > 0);

    for (const entry of group.rows) {
      const row = sheet.getRow(currentRow);
      row.height = 19;
      row.values = [
        entry.seq,
        entry.code,
        entry.fullName,
        entry.baseSalary || null,
        entry.dailyRate || null,
        entry.workingDays || null,
        entry.dailyWageTotal > 0 ? entry.dailyWageTotal : (entry.dailyRate > 0 ? 0 : null),
        entry.ot1x || null,
        entry.ot15x || null,
        entry.ot2x || null,
        entry.housing || null,
        entry.phone || null,
        entry.license || null,
        entry.incomeTotal,
        entry.sso || null,
        entry.loan || null,
        entry.netPay,
        entry.remark || null,
      ];

      for (let c = 1; c <= 18; c += 1) {
        const cell = row.getCell(c);
        cell.font = { name: "Tahoma", size: 9 };
        cell.border = THIN_BORDER;
        cell.alignment = {
          horizontal: c === 1 || c === 2 || c === 18 ? "center" : c === 3 ? "left" : "right",
          vertical: "middle",
        };
        if (c === 3) {
          cell.fill = NAME_FILL;
        }
        if (c === 10 && !groupHasOt2 && !entry.ot2x) {
          cell.fill = OT2_MUTED_FILL;
        }
        if (c >= 4 && c <= 17 && c !== 6) {
          cell.numFmt = MONEY_FORMAT;
        }
        if (entry.isCash && (c === 17 || c === 18)) {
          cell.font = { name: "Tahoma", size: 9, color: { argb: "FFCC0000" } };
        }
      }
      currentRow += 1;
    }

    // Department subtotal row
    const subRow = sheet.getRow(currentRow);
    subRow.height = 20;
    subRow.values = [
      null,
      null,
      group.subtotalLabel,
      group.subtotal.baseSalary,
      null,
      null,
      group.subtotal.dailyWageTotal,
      group.subtotal.ot1x,
      group.subtotal.ot15x,
      group.subtotal.ot2x,
      group.subtotal.housing,
      group.subtotal.phone,
      group.subtotal.license,
      group.subtotal.incomeTotal,
      group.subtotal.sso,
      group.subtotal.loan,
      group.subtotal.netPay,
      null,
    ];
    for (let c = 1; c <= 18; c += 1) {
      const cell = subRow.getCell(c);
      cell.font = { name: "Tahoma", size: 9, bold: true };
      cell.fill = SUBTOTAL_FILL;
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: c <= 3 ? "right" : "right", vertical: "middle" };
      if (c >= 4 && c <= 17 && c !== 5 && c !== 6) {
        cell.numFmt = MONEY_FORMAT;
      }
    }
    currentRow += 1;
  }

  // Grand summary 3 lines at bottom right (Cols N..Q)
  const totalNetRowIdx = currentRow;
  sheet.mergeCells(`N${totalNetRowIdx}:P${totalNetRowIdx}`);
  sheet.getCell(`N${totalNetRowIdx}`).value = "รวมจ่ายเงินสุทธิ";
  sheet.getCell(`N${totalNetRowIdx}`).font = { name: "Tahoma", size: 10, bold: true };
  sheet.getCell(`N${totalNetRowIdx}`).alignment = { horizontal: "left", vertical: "middle" };
  sheet.getCell(`Q${totalNetRowIdx}`).value = model.grandTotalNetPay;
  sheet.getCell(`Q${totalNetRowIdx}`).font = { name: "Tahoma", size: 10, bold: true };
  sheet.getCell(`Q${totalNetRowIdx}`).alignment = { horizontal: "right", vertical: "middle" };
  sheet.getCell(`Q${totalNetRowIdx}`).numFmt = MONEY_FORMAT;
  sheet.getRow(totalNetRowIdx).height = 20;

  const cashRowIdx = currentRow + 1;
  sheet.mergeCells(`N${cashRowIdx}:P${cashRowIdx}`);
  sheet.getCell(`N${cashRowIdx}`).value = "หักยอดเงินสด,จ่ายแล้ว =";
  sheet.getCell(`N${cashRowIdx}`).font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FFCC0000" } };
  sheet.getCell(`N${cashRowIdx}`).alignment = { horizontal: "left", vertical: "middle" };
  sheet.getCell(`Q${cashRowIdx}`).value = model.cashDeductedTotal;
  sheet.getCell(`Q${cashRowIdx}`).font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FFCC0000" } };
  sheet.getCell(`Q${cashRowIdx}`).alignment = { horizontal: "right", vertical: "middle" };
  sheet.getCell(`Q${cashRowIdx}`).numFmt = MONEY_FORMAT;
  sheet.getRow(cashRowIdx).height = 20;

  const directRowIdx = currentRow + 2;
  sheet.mergeCells(`N${directRowIdx}:P${directRowIdx}`);
  sheet.getCell(`N${directRowIdx}`).value = "ยอดจ่ายตรงPayroll";
  sheet.getCell(`Q${directRowIdx}`).value = model.directPayrollTotal;
  sheet.getCell(`Q${directRowIdx}`).numFmt = MONEY_FORMAT;
  for (let c = 14; c <= 17; c += 1) {
    const cell = sheet.getRow(directRowIdx).getCell(c);
    cell.font = { name: "Tahoma", size: 10, bold: true };
    cell.fill = YELLOW_FILL;
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "double", color: { argb: "FF000000" } },
    };
    cell.alignment = { horizontal: c === 17 ? "right" : "left", vertical: "middle" };
  }
  sheet.getRow(directRowIdx).height = 22;

  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
  };
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  return workbook;
}

function pdfHeaderCell(text: string, options: Record<string, unknown> = {}) {
  return {
    text,
    bold: true,
    alignment: "center",
    fontSize: 7,
    ...options,
  };
}

function pdfCell(text: string, options: Record<string, unknown> = {}) {
  return {
    text,
    fontSize: 7,
    ...options,
  };
}

/** Builds the PDFMake definition for the 18-column grouped TJARUSCH_PAYROLL landscape A4 report. */
export function createPayrollSummarySheetPdfDefinition(
  payroll: Payroll,
  options: PayrollReportFilterOptions = {},
) {
  const model = buildPayrollSummarySheetModel(payroll, options);

  const headerRow1 = [
    pdfHeaderCell("ลำดับ", { rowSpan: 3, margin: [0, 10, 0, 0] }),
    pdfHeaderCell("รหัส", { rowSpan: 3, margin: [0, 10, 0, 0] }),
    pdfHeaderCell("ชื่อ - นามสกุล", { rowSpan: 3, margin: [0, 10, 0, 0] }),
    pdfHeaderCell("รายการเงินได้", { colSpan: 10 }),
    "", "", "", "", "", "", "", "", "",
    pdfHeaderCell("รวมรายได้", { rowSpan: 3, margin: [0, 10, 0, 0] }),
    pdfHeaderCell("รายการหัก", { colSpan: 2 }),
    "",
    pdfHeaderCell("จ่ายเงินสุทธิ", { rowSpan: 3, margin: [0, 10, 0, 0] }),
    pdfHeaderCell("หมายเหตุ", { rowSpan: 3, margin: [0, 10, 0, 0] }),
  ];

  const headerRow2 = [
    "", "", "",
    pdfHeaderCell("เงินเดือน", { rowSpan: 2, margin: [0, 6, 0, 0] }),
    pdfHeaderCell("ค่าแรงรายวัน", { colSpan: 3 }),
    "", "",
    pdfHeaderCell("ค่าล่วงเวลา OT", { colSpan: 3 }),
    "", "",
    pdfHeaderCell("ค่าที่พัก", { rowSpan: 2, margin: [0, 6, 0, 0] }),
    pdfHeaderCell("ค่า\nโทรศัพท์", { rowSpan: 2, margin: [0, 2, 0, 0] }),
    pdfHeaderCell("ค่าใบกว", { rowSpan: 2, margin: [0, 6, 0, 0] }),
    "",
    pdfHeaderCell("ประกัน\nสังคม", { rowSpan: 2, margin: [0, 2, 0, 0] }),
    pdfHeaderCell("กองทุนกู้\nยืม", { rowSpan: 2, margin: [0, 2, 0, 0] }),
    "", "",
  ];

  const headerRow3 = [
    "", "", "", "",
    pdfHeaderCell("วันละ"),
    pdfHeaderCell("จน.วันที่\nทำงาน"),
    pdfHeaderCell("จำนวน"),
    pdfHeaderCell("OT x1"),
    pdfHeaderCell("OT x1.5"),
    pdfHeaderCell("OT x2"),
    "", "", "", "", "", "", "", "",
  ];

  const body: unknown[][] = [headerRow1, headerRow2, headerRow3];

  for (const group of model.groups) {
    const groupHasOt2 = group.rows.some((r) => r.ot2x > 0);
    for (const entry of group.rows) {
      const cashColor = entry.isCash ? { color: "#cc0000" } : {};
      body.push([
        pdfCell(String(entry.seq), { alignment: "center" }),
        pdfCell(entry.code, { alignment: "center" }),
        pdfCell(entry.fullName, { fillColor: "#e2efda" }),
        pdfCell(formatNumber(entry.baseSalary), { alignment: "right" }),
        pdfCell(formatNumber(entry.dailyRate), { alignment: "right" }),
        pdfCell(entry.workingDays ? String(entry.workingDays) : "", { alignment: "right" }),
        pdfCell(entry.dailyWageTotal > 0 ? formatNumber(entry.dailyWageTotal) : (entry.dailyRate > 0 ? "0.00" : ""), { alignment: "right" }),
        pdfCell(formatNumber(entry.ot1x), { alignment: "right" }),
        pdfCell(formatNumber(entry.ot15x), { alignment: "right" }),
        pdfCell(formatNumber(entry.ot2x), {
          alignment: "right",
          ...(!groupHasOt2 && !entry.ot2x ? { fillColor: "#d9d9d9" } : {}),
        }),
        pdfCell(formatNumber(entry.housing), { alignment: "right" }),
        pdfCell(formatNumber(entry.phone), { alignment: "right" }),
        pdfCell(formatNumber(entry.license), { alignment: "right" }),
        pdfCell(formatNumber(entry.incomeTotal, true), { alignment: "right" }),
        pdfCell(formatNumber(entry.sso), { alignment: "right" }),
        pdfCell(formatNumber(entry.loan), { alignment: "right" }),
        pdfCell(formatNumber(entry.netPay, true), { alignment: "right", ...cashColor }),
        pdfCell(entry.remark, { alignment: "center", ...cashColor }),
      ]);
    }

    // Department subtotal row
    const subOpts = { bold: true, fillColor: "#d9e1f2", alignment: "right" };
    body.push([
      pdfCell("", { fillColor: "#d9e1f2" }),
      pdfCell("", { fillColor: "#d9e1f2" }),
      pdfCell(group.subtotalLabel, { bold: true, fillColor: "#d9e1f2", alignment: "right" }),
      pdfCell(formatNumber(group.subtotal.baseSalary, true), subOpts),
      pdfCell("", { fillColor: "#d9e1f2" }),
      pdfCell("", { fillColor: "#d9e1f2" }),
      pdfCell(formatNumber(group.subtotal.dailyWageTotal, true), subOpts),
      pdfCell(formatNumber(group.subtotal.ot1x, true), subOpts),
      pdfCell(formatNumber(group.subtotal.ot15x, true), subOpts),
      pdfCell(formatNumber(group.subtotal.ot2x, true), subOpts),
      pdfCell(formatNumber(group.subtotal.housing, true), subOpts),
      pdfCell(formatNumber(group.subtotal.phone, true), subOpts),
      pdfCell(formatNumber(group.subtotal.license, true), subOpts),
      pdfCell(formatNumber(group.subtotal.incomeTotal, true), subOpts),
      pdfCell(formatNumber(group.subtotal.sso, true), subOpts),
      pdfCell(formatNumber(group.subtotal.loan, true), subOpts),
      pdfCell(formatNumber(group.subtotal.netPay, true), subOpts),
      pdfCell("", { fillColor: "#d9e1f2" }),
    ]);
  }

  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [16, 18, 16, 18],
    defaultStyle: { font: "NotoSansThai", fontSize: 7, color: "#111827" },
    content: [
      {
        text: model.title,
        bold: true,
        fontSize: 10,
        alignment: "center",
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 3,
          widths: [18, 24, "*", 40, 28, 26, 34, 28, 36, 36, 34, 32, 34, 42, 32, 34, 42, 32],
          body,
        },
        layout: "payrollSheetGrid",
      },
      {
        margin: [0, 6, 34, 0],
        columns: [
          { width: "*", text: "" },
          {
            width: 220,
            table: {
              widths: ["*", 74],
              body: [
                [
                  { text: "รวมจ่ายเงินสุทธิ", bold: true, fontSize: 8.5, border: [false, false, false, false] },
                  { text: formatNumber(model.grandTotalNetPay, true), bold: true, fontSize: 8.5, alignment: "right", border: [false, false, false, false] },
                ],
                [
                  { text: "หักยอดเงินสด,จ่ายแล้ว =", bold: true, fontSize: 8.5, color: "#cc0000", border: [false, false, false, false] },
                  { text: formatNumber(model.cashDeductedTotal, true), bold: true, fontSize: 8.5, color: "#cc0000", alignment: "right", border: [false, false, false, false] },
                ],
                [
                  { text: "ยอดจ่ายตรงPayroll", bold: true, fontSize: 8.5, fillColor: "#ffff00", border: [false, true, false, true] },
                  { text: formatNumber(model.directPayrollTotal, true), bold: true, fontSize: 8.5, alignment: "right", fillColor: "#ffff00", border: [false, true, false, true] },
                ],
              ],
            },
            layout: {
              hLineWidth: () => 0.75,
              hLineColor: () => "#000000",
              vLineWidth: () => 0,
              paddingLeft: () => 4,
              paddingRight: () => 4,
              paddingTop: () => 2,
              paddingBottom: () => 2,
            },
          },
        ],
      },
    ],
  };
}

/** Creates the 18-column grouped TJARUSCH_PAYROLL PDF buffer (.pdf). */
export async function createPayrollSummarySheetPdf(
  payroll: Payroll,
  options: PayrollReportFilterOptions = {},
): Promise<Buffer> {
  return createPdfMakeBuffer(createPayrollSummarySheetPdfDefinition(payroll, options));
}
