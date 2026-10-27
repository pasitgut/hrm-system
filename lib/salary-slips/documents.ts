import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPdfMakeBuffer } from "@/lib/pdfmake/server";
import { deductionFields, incomeFields, formatMoney, periodLabel, type ExportSlip } from "./model";

const assetPath = (...parts: string[]) => path.join(process.cwd(), "lib", "salary-slips", "assets", ...parts);
const companyName = "บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด";
const bankAccount = (value: string) => /^\d{10}$/.test(value) ? `${value.slice(0, 3)}-${value[3]}-${value.slice(4, 8)}-${value.slice(8)}` : value;
const lastDay = (item: ExportSlip) => new Date(Date.UTC(item.data.year, item.data.month, 0)).getUTCDate();

export async function createExcel(items: ExportSlip[]): Promise<Buffer> {
  const source = new ExcelJS.Workbook();
  await source.xlsx.readFile(assetPath("template.xlsx"));
  const template = source.getWorksheet("สลิปเงินเดือน") ?? source.worksheets[0];
  const workbook = new ExcelJS.Workbook();
  const imageId = workbook.addImage({ buffer: await readFile(assetPath("logo.png")) as never, extension: "png" });
  const groups = new Map<string, ExportSlip[]>();
  for (const item of items) groups.set(item.employeeId, [...(groups.get(item.employeeId) ?? []), item]);
  const usedNames = new Set<string>();
  for (const records of groups.values()) {
    const base = `${records[0].data.name}`.replace(/[\\/*?:\[\]]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "พนักงาน";
    let name = base, suffix = 1;
    while (usedNames.has(name.toLowerCase())) name = `${base.slice(0, 25)}_${suffix++}`;
    usedNames.add(name.toLowerCase());
    const sheet = workbook.addWorksheet(name);
    for (let col = 1; col <= 12; col++) sheet.getColumn(col).width = template.getColumn(col).width;
    for (const [index, item] of records.sort((a, b) => a.data.month - b.data.month).entries()) {
      const offset = index * 33;
      for (let row = 1; row <= 33; row++) {
        sheet.getRow(row + offset).height = template.getRow(row).height;
        for (let col = 1; col <= 12; col++) {
          const original = template.getCell(row, col), cell = sheet.getCell(row + offset, col);
          if (original.isMerged && original.master.address !== original.address) continue;
          cell.value = original.value;
          cell.style = structuredClone(original.style);
        }
      }
      for (const range of (template.model.merges ?? [])) {
        const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)!;
        if (Number(match[4]) <= 33) sheet.mergeCells(`${match[1]}${Number(match[2]) + offset}:${match[3]}${Number(match[4]) + offset}`);
      }
      const put = (row: number, col: string, value: string | number) => { sheet.getCell(`${col}${row + offset}`).value = value; };
      const amount = (row: number, col: string, satang: number) => { put(row, col, satang / 100); sheet.getCell(`${col}${row + offset}`).numFmt = "#,##0.00"; };
      for (const [row, cols] of [[6, ["B", "D", "H", "J", "L"]], [7, ["B", "D", "H"]], [9, ["B", "E"]], [10, ["B", "E"]], [26, ["D", "I", "K"]], [31, ["A", "C", "F", "H", "J"]]] as [number, string[]][]) for (const col of cols) put(row, col, "");
      for (let row = 14; row <= 25; row++) for (const col of ["A", "C", "D", "F", "I", "K"]) put(row, col, "");
      put(1, "A", ""); put(4, "J", periodLabel(item.data.year, item.data.month));
      put(6, "B", item.data.code); put(6, "D", item.data.name); put(6, "H", item.data.department); put(6, "J", 1); put(6, "L", lastDay(item));
      put(9, "B", item.data.bank); put(9, "E", bankAccount(item.data.bankAccount));
      let incomeRow = 14, deductionRow = 14;
      for (const [key, label] of incomeFields) if (item.data.incomes[key]) {
        put(incomeRow, "A", label); put(incomeRow, "C", key === "salary" ? lastDay(item) : 1); amount(incomeRow++, "D", item.data.incomes[key]);
      }
      for (const [key, label] of deductionFields) if (item.data.deductions[key]) { put(deductionRow, "F", label); amount(deductionRow++, "I", item.data.deductions[key]); }
      put(14, "K", `${lastDay(item)} ${periodLabel(item.data.year, item.data.month)}`);
      amount(26, "D", item.data.incomeTotal); amount(26, "I", item.data.deductionTotal); amount(26, "K", item.data.netPay);
      amount(31, "A", item.cumulative.income); amount(31, "C", item.cumulative.tax); amount(31, "F", item.cumulative.social); amount(31, "H", item.cumulative.provident);
      if (item.missingMonths.length) sheet.getCell(`A${31 + offset}`).note = `ประวัติยังไม่มีเดือน ${item.missingMonths.join(", ")} ยอดสะสมรวมเฉพาะข้อมูลที่บันทึก`;
      sheet.addImage(imageId, { tl: { col: 0, row: offset }, ext: { width: 160, height: 80 } });
      if (index < records.length - 1) sheet.getRow(offset + 33).addPageBreak();
    }
    sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      printArea: `A1:L${records.length * 33}`, margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 } };
    sheet.views = [{ state: "normal", showGridLines: false }];
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function cell(text: string, options: Record<string, unknown> = {}) {
  return { text, margin: [2, 0, 2, 0], ...options };
}

function amountCell(value: number, options: Record<string, unknown> = {}) {
  return cell(formatMoney(value), { alignment: "right", ...options });
}

function identityCell(label: string, value: string) {
  return {
    stack: [
      { text: label, fontSize: 9, color: "#66717d" },
      { text: value || "—", bold: true, fontSize: 11, margin: [0, 3, 0, 0] },
    ],
  };
}

export function createSalarySlipPdfDefinition(items: ExportSlip[], logoDataUri: string) {
  const content = items.map((item, index) => {
    const { data } = item;
    const income = incomeFields.filter(([key]) => data.incomes[key]);
    const deductions = deductionFields.filter(([key]) => data.deductions[key]);
    const rowCount = Math.max(income.length, deductions.length, 8);
    const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
      const incomeEntry = income[rowIndex];
      const deductionEntry = deductions[rowIndex];
      return [
        cell(incomeEntry?.[1] ?? ""),
        cell(incomeEntry ? String(incomeEntry[0] === "salary" ? lastDay(item) : 1) : "", { alignment: "right" }),
        incomeEntry ? amountCell(data.incomes[incomeEntry[0]]) : cell(""),
        cell(deductionEntry?.[1] ?? ""),
        deductionEntry ? amountCell(data.deductions[deductionEntry[0]]) : cell(""),
      ];
    });
    const body = [
      ["รายได้ / Income", "จำนวน", "จำนวนเงิน", "รายการหัก / Deduction", "จำนวนเงิน"].map((label) => cell(label, { bold: true, alignment: "center", fillColor: "#f6f7f8", fontSize: 10 })),
      ...rows,
      [
        cell("รวมรายได้", { colSpan: 2, bold: true }),
        "",
        amountCell(data.incomeTotal, { bold: true }),
        cell("รวมรายการหัก", { bold: true }),
        amountCell(data.deductionTotal, { bold: true }),
      ],
    ];
    const cumulative: Array<Record<string, any>> = [
      ["รายได้สะสมต่อปี", item.cumulative.income],
      ["ภาษีสะสมต่อปี", item.cumulative.tax],
      ["ประกันสังคมสะสมต่อปี", item.cumulative.social],
      ["กองทุนสะสมต่อปี", item.cumulative.provident],
    ].map(([label, value]) => ({
      stack: [
        { text: String(label), fontSize: 9, color: "#66717d", alignment: "center" },
        { text: formatMoney(Number(value)), bold: true, fontSize: 11, alignment: "center", margin: [0, 4, 0, 0] },
      ],
    }));
    cumulative.push({
      stack: [
        { text: "ลงชื่อพนักงาน", fontSize: 9, color: "#66717d", alignment: "center" },
        { text: "__________________", fontSize: 10, alignment: "center", margin: [0, 9, 0, 0] },
      ],
    });

    return {
      stack: [
        {
          columns: [
            {
              width: 190,
              stack: [
                { image: logoDataUri, fit: [135, 48], alignment: "left" },
                { text: companyName, fontSize: 9, color: "#4b5563", margin: [0, 3, 0, 0] },
              ],
            },
            {
              width: "*",
              stack: [
                { text: "สลิปเงินเดือน / ใบจ่ายเงินเดือน", fontSize: 19, bold: true, alignment: "right" },
                { text: `Pay Slip · ${periodLabel(data.year, data.month)}`, fontSize: 11, alignment: "right", color: "#4b5563", margin: [0, 3, 0, 0] },
              ],
              margin: [0, 7, 0, 0],
            },
          ],
          columnGap: 15,
          margin: [0, 0, 0, 8],
        },
        {
          table: {
            widths: ["*", "*", "*"],
            body: [
              [identityCell("รหัสพนักงาน / Emp. Code", data.code), identityCell("ชื่อ-สกุล / Name", data.name), identityCell("แผนก / Dept", data.department)],
              [identityCell("ธนาคาร / Bank", data.bank), identityCell("เลขบัญชี / A/C No.", bankAccount(data.bankAccount)), identityCell("งวด / Pay period", `1–${lastDay(item)} · จ่าย ${lastDay(item)} ${periodLabel(data.year, data.month)}`)],
            ],
          },
          layout: "salarySlipBox",
          margin: [0, 0, 0, 8],
        },
        {
          table: { widths: ["*", 45, 94, "*", 94], body },
          layout: "salarySlipGrid",
          margin: [0, 0, 0, 8],
        },
        {
          table: {
            widths: ["*", "*"],
            body: [[
              cell("รายได้สุทธิ / Net Income", { bold: true, fontSize: 13, fillColor: "#f6f7f8" }),
              cell(`${formatMoney(data.netPay)} บาท`, { bold: true, fontSize: 15, alignment: "right", fillColor: "#f6f7f8" }),
            ]],
          },
          layout: "salarySlipBox",
          margin: [0, 0, 0, 8],
        },
        {
          table: { widths: ["*", "*", "*", "*", "*"], body: [cumulative] },
          layout: "salarySlipBox",
        },
        ...(item.missingMonths.length ? [{
          text: `ยอดสะสมรวมเฉพาะประวัติที่บันทึก ยังไม่มีข้อมูลเดือน ${item.missingMonths.join(", ")}`,
          fontSize: 9,
          color: "#8a4b08",
          margin: [0, 7, 0, 0],
        }] : []),
      ],
      ...(index ? { pageBreak: "before" } : {}),
    };
  });

  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [28, 18, 28, 20],
    defaultStyle: { font: "NotoSansThai", fontSize: 10, color: "#202a35" },
    content,
  };
}

export async function createPdf(items: ExportSlip[]): Promise<Buffer> {
  const logo = await readFile(assetPath("logo.png"));
  const logoDataUri = `data:image/png;base64,${logo.toString("base64")}`;
  return createPdfMakeBuffer(createSalarySlipPdfDefinition(items, logoDataUri));
}
