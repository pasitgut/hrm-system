import { withCumulative, type ExportSlip, type ImportRow, type SlipData } from "./model";
import { parseWorkbook } from "./parser";

export const MAX_UPLOAD_FILES = 12;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const VERCEL_SAFE_UPLOAD_BYTES = 3.5 * 1024 * 1024;
export const MAX_SINGLE_WORKBOOK_BYTES = 4 * 1024 * 1024;

export class SlipError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "SlipError";
  }
}

export type UploadedWorkbook = {
  name: string;
  buffer: Buffer;
};

export function duplicateSourceRows(rows: ImportRow[]) {
  const seen = new Map<string, ImportRow>();
  for (const row of rows) {
    if (!row.data) continue;
    const key = `${row.data.code}:${row.data.year}:${row.data.month}`;
    const previous = seen.get(key);
    if (previous) {
      row.errors.push("รหัสพนักงานและงวดซ้ำในไฟล์ที่อัปโหลด");
      previous.errors.push("รหัสพนักงานและงวดซ้ำในไฟล์ที่อัปโหลด");
    } else {
      seen.set(key, row);
    }
  }
}

export async function parseSalaryWorkbookBatch(files: UploadedWorkbook[]): Promise<ImportRow[]> {
  if (!files.length || files.length > MAX_UPLOAD_FILES) {
    throw new SlipError(`เลือกไฟล์ Excel 1–${MAX_UPLOAD_FILES} ไฟล์`);
  }

  let totalBytes = 0;
  const rows: ImportRow[] = [];

  for (const [index, file] of files.entries()) {
    totalBytes += file.buffer.byteLength;
    if (!/\.xlsx$/i.test(file.name) || file.buffer.byteLength > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
      throw new SlipError("รองรับไฟล์ .xlsx ไม่เกิน 10 MB ต่อไฟล์ และรวมไม่เกิน 25 MB", 413);
    }
    try {
      rows.push(...await parseWorkbook(file.buffer, file.name, index));
    } catch (error) {
      throw new SlipError(`${file.name}: ${(error as Error).message}`);
    }
  }

  const invalidRows = rows.filter((row) => !row.data || row.errors.length > 0);
  if (invalidRows.length > 0) {
    const details = invalidRows
      .slice(0, 5)
      .map((row) => `${row.file} แถว ${row.row}: ${row.errors.join(", ") || "ข้อมูลไม่ถูกต้อง"}`)
      .join(" | ");
    const extra = invalidRows.length > 5 ? ` และอีก ${invalidRows.length - 5} รายการ` : "";
    throw new SlipError(`พบข้อมูลผิดพลาดในไฟล์ Excel (${details}${extra})`);
  }

  return rows;
}

export function validateCombinedSalaryRows(rows: ImportRow[]): ImportRow[] {
  const cloned = rows.map((row) => ({ ...row, errors: [...row.errors], warnings: [...row.warnings] }));
  duplicateSourceRows(cloned);

  const invalidRows = cloned.filter((row) => !row.data || row.errors.length > 0);
  if (invalidRows.length > 0) {
    const details = invalidRows
      .slice(0, 5)
      .map((row) => `${row.file} แถว ${row.row}: ${row.errors.join(", ") || "ข้อมูลไม่ถูกต้อง"}`)
      .join(" | ");
    const extra = invalidRows.length > 5 ? ` และอีก ${invalidRows.length - 5} รายการ` : "";
    throw new SlipError(`พบข้อมูลผิดพลาดในไฟล์ Excel (${details}${extra})`);
  }

  return cloned;
}

export async function parseUploadedSalaryWorkbooks(files: UploadedWorkbook[]): Promise<ImportRow[]> {
  return validateCombinedSalaryRows(await parseSalaryWorkbookBatch(files));
}

export function buildStatelessExportSlips(
  rows: ImportRow[],
  options: { year?: number; month?: number } = {},
): { year: number; month: number | null; items: ExportSlip[] } {
  const validRows = rows.filter((row): row is ImportRow & { data: SlipData } => row.data !== null && row.errors.length === 0);
  if (!validRows.length) {
    throw new SlipError("ไม่พบรายการสลิปที่ใช้งานได้ในไฟล์ที่อัปโหลด");
  }

  const allWithCumulative = withCumulative(
    validRows.map((row) => ({
      id: row.key,
      employeeId: row.data.code,
      revision: 1,
      data: row.data,
    })),
  );

  const targetYear = options.year ?? Math.max(...allWithCumulative.map((item) => item.data.year));
  const targetMonth = options.month ?? null;

  const filtered = allWithCumulative
    .filter((item) => item.data.year === targetYear && (targetMonth === null || item.data.month === targetMonth))
    .sort((left, right) =>
      left.data.code.localeCompare(right.data.code, "th-TH", { numeric: true, sensitivity: "base" })
      || left.data.month - right.data.month,
    );

  if (!filtered.length) {
    throw new SlipError(
      targetMonth !== null
        ? `ไม่พบข้อมูลสลิปของเดือน ${targetMonth}/${targetYear + 543} ในไฟล์ที่อัปโหลด`
        : `ไม่พบข้อมูลสลิปของปี ${targetYear + 543} ในไฟล์ที่อัปโหลด`,
      400,
    );
  }

  return { year: targetYear, month: targetMonth, items: filtered };
}
