import ExcelJS from "exceljs";
import { deductionFields, incomeFields, type ImportRow, type SlipData } from "./model";

function value(cell: ExcelJS.Cell): unknown {
  const raw = cell.value;
  if (raw && typeof raw === "object" && "error" in raw) throw new Error("เซลล์มีข้อผิดพลาดจากสูตร");
  if (raw && typeof raw === "object" && "formula" in raw) {
    if (raw.result === undefined || raw.result === null) throw new Error("สูตรไม่มีผลลัพธ์ กรุณาเปิดแล้วบันทึกไฟล์ด้วย Excel ก่อน");
    return raw.result;
  }
  if (raw && typeof raw === "object" && "sharedFormula" in raw) {
    if (raw.result === undefined || raw.result === null) throw new Error("สูตรไม่มีผลลัพธ์");
    return raw.result;
  }
  if (raw && typeof raw === "object" && "richText" in raw) return raw.richText.map((part) => part.text).join("");
  return raw;
}
export function parseMoney(raw: unknown, required = false): number {
  if (raw === null || raw === undefined || raw === "") {
    if (required) throw new Error("ไม่พบยอดรวม");
    return 0;
  }
  const text = String(raw).trim().replaceAll(",", "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error("จำนวนเงินไม่ถูกต้อง");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  const amount = Number(whole) * 100 + Number((fraction + "00").slice(0, 2)) + (Number(fraction[2] ?? 0) >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(amount) || amount > 999999999999) throw new Error("จำนวนเงินเกินขอบเขตที่รองรับ");
  return negative ? -amount : amount;
}
export function parsePeriod(raw: unknown): { year: number; month: number } {
  let year: number, month: number, day: number;
  if (raw instanceof Date || typeof raw === "number") {
    const date = raw instanceof Date ? raw : new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    year = date.getUTCFullYear(); month = date.getUTCMonth() + 1; day = date.getUTCDate();
  } else {
    const text = String(raw ?? "").trim();
    const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/);
    const reverse = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T].*)?$/);
    if (match) [, year, month, day] = match.map(Number);
    else if (reverse) [, day, month, year] = reverse.map(Number);
    else throw new Error("วันที่งวดไม่ถูกต้อง ใช้วัน/เดือน/ปี หรือปี-เดือน-วัน");
  }
  if (year > 2400) year -= 543;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2200 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) throw new Error("วันที่งวดไม่ถูกต้อง");
  return { year, month };
}
function identifier(cell: ExcelJS.Cell): string {
  const raw = value(cell);
  if (typeof raw === "number" && /^0+$/.test(cell.numFmt)) return String(Math.trunc(raw)).padStart(cell.numFmt.length, "0");
  return String(raw ?? "").trim();
}
export async function parseWorkbook(buffer: Buffer, file: string, fileIndex: number): Promise<ImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0]; // Same input sheet as the original pandas reader.
  if (!sheet || sheet.columnCount < 42 || sheet.rowCount < 9) throw new Error(`${file}: โครงสร้างไม่ตรงกับ Payroll เดิม (อย่างน้อย 42 คอลัมน์ เริ่มข้อมูลแถว 9)`);
  if (sheet.rowCount > 10000) throw new Error(`${file}: รองรับไม่เกิน 10,000 แถวต่อไฟล์`);
  let department = "";
  const result: ImportRow[] = [];
  for (let rowNumber = 9; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const entry: ImportRow = { key: `${fileIndex}:${rowNumber}`, file, sheet: sheet.name, row: rowNumber, data: null, errors: [], warnings: [] };
    try {
      const first = String(value(row.getCell(1)) ?? "").trim();
      const code = identifier(row.getCell(2));
      const name = String(value(row.getCell(3)) ?? "").trim();
      if (/^(รวม|ยอดรวม|total|grand total)(\s|$)/i.test(first) || /^(รวม|ยอดรวม|total)$/i.test(code)) continue;
      if (!code && !name) { if (first && !/^\d+(\.\d+)?$/.test(first)) department = first; continue; }
      if (/^(รหัสพนักงาน|รหัส|emp\.?\s*code|employee\s*code)$/i.test(code)) continue;
      if (first && !/^\d+(\.\d+)?$/.test(first)) department = first;
      if (!code) throw new Error("ไม่พบรหัสพนักงาน");
      if (!name) throw new Error("ไม่พบชื่อพนักงาน");
      const period = parsePeriod(value(row.getCell(5)));
      const amount = (column: number, label: string, required = false) => {
        try { return parseMoney(value(row.getCell(column)), required); }
        catch (error) { throw new Error(`${label} (${row.getCell(column).address}): ${(error as Error).message}`); }
      };
      const incomes = Object.fromEntries(incomeFields.map(([key, label, col]) => [key, amount(col, label)]));
      const deductions = Object.fromEntries(deductionFields.map(([key, label, col]) => [key, amount(col, label)]));
      const data: SlipData = { code, name, department, ...period, incomes, deductions,
        incomeTotal: amount(30, "รวมรายได้", true), deductionTotal: amount(38, "รวมรายหัก", true), netPay: amount(39, "รับสุทธิ", true),
        bank: String(value(row.getCell(41)) ?? "").trim(), bankAccount: identifier(row.getCell(42)) };
      if (Math.abs(Object.values(incomes).reduce((a, b) => a + b, 0) - data.incomeTotal) > 1) entry.errors.push("รวมรายได้ไม่ตรงกับรายละเอียด");
      if (Math.abs(Object.values(deductions).reduce((a, b) => a + b, 0) - data.deductionTotal) > 1) entry.errors.push("รวมรายหักไม่ตรงกับรายละเอียด");
      if (Math.abs(data.incomeTotal - data.deductionTotal - data.netPay) > 1) entry.errors.push("เงินสุทธิไม่ตรงกับรายได้ลบรายหัก");
      if (typeof value(row.getCell(42)) === "number" && !/^0+$/.test(row.getCell(42).numFmt)) entry.warnings.push("บัญชีธนาคารเป็นตัวเลข ตรวจเลขศูนย์นำหน้าในต้นฉบับ");
      entry.data = data;
    } catch (error) { entry.errors.push((error as Error).message); }
    result.push(entry);
  }
  if (!result.length) throw new Error(`${file}: ไม่พบรายการพนักงาน`);
  return result;
}
