import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import {
  agreementParticipantForSignatureBox,
  nextAgreementStatus,
  type AssetAgreementStatus,
  type AssetSignatureBox,
  type AssetSignaturePosition,
  type AssetSignatureSigner,
  type AssetSignatureStatus,
} from "@/asset-borrowing/domain/asset";
import {
  EXPECTED_SHEETS,
  MAX_MIGRATION_FILE_BYTES,
  SHEET_ASSETS,
  SHEET_EMPLOYEES,
  SHEET_LEAVE,
  SHEET_OVERTIME,
  SHEET_WORK,
} from "@/lib/migration/constants";
import type {
  WorkTrackingRecordStatus,
  WorkTrackingSession,
  WorkTrackingSubStatus,
} from "@/lib/work-tracking/types";

export {
  EXPECTED_SHEETS,
  MAX_MIGRATION_FILE_BYTES,
  SHEET_ASSETS,
  SHEET_EMPLOYEES,
  SHEET_LEAVE,
  SHEET_OVERTIME,
  SHEET_WORK,
};

export const UUID_NAMESPACE = "6f1c2a54-3b0e-4f0b-9a52-7a3f0d1e5c10";

const EXCLUDED_EMPLOYEE_CODES = new Set(["7777", "0000"]);
const PLACEHOLDER_START_YEAR = 2010;
const OVERTIME_DEFAULT_REASON = "ไม่ระบุ";
const LEAVE_DECISION_HOUR = 12;

const PREFIX_ALIASES: Record<string, string> = {
  "น.ส.": "นางสาว",
  "น.ส": "นางสาว",
  "นส.": "นางสาว",
  "นส": "นางสาว",
};

const EMPLOYMENT_TYPE_BY_SHEET_TEXT: Record<string, string> = {
  "ประจำ": "full_time",
  "พนักงานประจำ": "full_time",
  full_time: "full_time",
  "สัญญา": "contract",
  "สัญญาจ้าง": "contract",
  contract: "contract",
  "รายวัน": "daily",
  daily: "daily",
  "ทดลองงาน": "probation",
  probation: "probation",
};

const FORMER_EMPLOYEE_STATUS_TEXT = new Set(["พ้นสภาพ", "ลาออก", "inactive"]);
const ACTIVE_EMPLOYEE_STATUS_TEXT = new Set(["ปฏิบัติงาน", "ทำงาน", "active"]);

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const APPROVER_ALIASES: Record<string, string> = {
  "max chantawat": "2005",
  "punpun kute": "1904",
};

const REQUEST_STATUS_BY_SHEET_TEXT: Record<string, string> = {
  "อนุมัติแล้ว": "approved",
  "อนุมัติ": "approved",
  "ไม่อนุมัติ": "rejected",
  "ยังไม่ได้ยืนยัน": "pending",
  "รออนุมัติ": "pending",
  "รอจัดการ": "pending",
  "ยกเลิก": "cancelled",
};

const DECIDED_STATUSES = new Set(["approved", "rejected"]);

const LEAVE_TYPE_BY_SHEET_TEXT: Record<string, string> = {
  "ลากิจ": "personal",
  "ลาป่วย": "sick",
  "ลาวันเกิด": "birthday",
  "ลาพักร้อน": "vacation",
};

const HALF_DAY_SHEET_TEXT = "ลาครึ่งวัน";

export type AssetRequestStatusValue =
  | "pending"
  | "approved"
  | "rejected"
  | "return_pending"
  | "returned"
  | "unknown";

const ASSET_STATUS_BY_SHEET_TEXT: Record<string, AssetRequestStatusValue> = {
  "รอ": "pending",
  "รออนุมัติ": "pending",
  "ยังไม่ได้ยืนยัน": "pending",
  "อนุมัติ": "approved",
  "อนุมัติแล้ว": "approved",
  "ไม่อนุมัติ": "rejected",
  "รอตรวจคืน": "return_pending",
  "รอรับคืน": "return_pending",
  "คืนแล้ว": "returned",
};

export type DbAgreementType = "borrow" | "asset_form";
export type DbAgreementStatus = "waiting_handover" | "waiting_employee" | "waiting_admin" | "completed";
export type DbAgreementParticipant = "employee" | "handover" | "admin";
export type DbReturnCondition = "original" | "damaged" | "lost";

const AGREEMENT_STATUS_MAP: Record<string, DbAgreementStatus> = {
  waitingHandover: "waiting_handover",
  waiting_handover: "waiting_handover",
  waitingEmployee: "waiting_employee",
  waiting_employee: "waiting_employee",
  waitingAdmin: "waiting_admin",
  waiting_admin: "waiting_admin",
  completed: "completed",
};

const AGREEMENT_STATUS_TO_DB: Record<AssetAgreementStatus, DbAgreementStatus> = {
  waitingHandover: "waiting_handover",
  waitingEmployee: "waiting_employee",
  waitingAdmin: "waiting_admin",
  completed: "completed",
};

const VALID_LAYOUT_POSITIONS = new Set<AssetSignaturePosition>([
  "bottom-left",
  "bottom-right",
  "lower-left",
  "lower-right",
]);
const VALID_SIGNER_KINDS = new Set<AssetSignatureSigner>(["employee", "admin", "other"]);
const VALID_SIGNATURE_STATUSES = new Set<AssetSignatureStatus>(["pending", "signed", "locked"]);
const VALID_RETURN_CONDITIONS = new Set<DbReturnCondition>(["original", "damaged", "lost"]);

const WORK_STATUS_NORMALIZATION: Record<string, WorkTrackingRecordStatus> = {
  in_progress: "in_progress",
  "in progress": "in_progress",
  completed: "completed",
  delivered: "delivered",
};

export class SheetMigrationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "SheetMigrationError";
  }
}

export type ParsedEmployee = {
  code: string;
  name: string;
  prefix: string | null;
  firstName: string;
  lastName: string;
  startDate: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  lineUid: string | null;
  birthDate: string | null;
  weeklyHolidays: number[];
  department: string | null;
  position: string | null;
  employmentTypeCode: string | null;
  isFormerStub: boolean;
};

export type ParsedOvertimeRequest = {
  id: string;
  sheetRow: number;
  employeeName: string;
  employeeCode: string;
  startAtIso: string;
  endAtIso: string;
  status: string;
  reason: string;
  decidedByCode: string | null;
  decisionNote: string | null;
};

export type ParsedLeaveRequest = {
  id: string;
  sheetRow: number;
  employeeName: string;
  employeeCode: string;
  leaveTypeCode: string;
  startOn: string;
  endOn: string;
  session: "full" | "am" | "pm";
  reason: string | null;
  attachmentUrl: string | null;
  status: string;
  decidedByCode: string | null;
  decidedAtIso: string | null;
  decisionNote: string | null;
};

export type ParsedAssetItem = {
  name: string;
  quantity: number;
  note: string;
};

export type ParsedAssetAgreementSigner = {
  boxId: string;
  position: number;
  participant: DbAgreementParticipant;
  label: string;
  role: string;
  signerKind: AssetSignatureSigner;
  signerName: string;
  layoutPosition: AssetSignaturePosition;
  page: 2 | 3 | null;
  xPercent: string | null;
  yPercent: string | null;
  signatureData: string | null;
  signatureStatus: AssetSignatureStatus;
  signedByCode: string | null;
  signedByName: string;
  signedAtIso: string | null;
  returnSignatureData: string | null;
  returnSignedByCode: string | null;
  returnSignedByName: string;
  returnSignedAtIso: string | null;
};

export type ParsedAssetAgreement = {
  id: string;
  type: DbAgreementType;
  title: string;
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
  status: DbAgreementStatus;
  createdByCode: string | null;
  createdByRawCode: string;
  createdByName: string;
  returnCondition: DbReturnCondition | null;
  documentDate: string;
  updatedAtIso: string | null;
  signers: ParsedAssetAgreementSigner[];
};

export type ParsedAssetRequest = {
  sheetId: string;
  employeeCode: string;
  position: string;
  department: string;
  formAtIso: string;
  updatedAtIso: string;
  fromDate: string;
  toDate: string | null;
  reason: string;
  remarks: string;
  status: AssetRequestStatusValue;
  approverName: string;
  approverCode: string | null;
  returnInspectorName: string;
  returnInspectorCode: string | null;
  approvedReturnByName: string;
  approvedReturnByCode: string | null;
  requestAttachments: string[];
  additionalAttachments: string[];
  borrowerSignatureData: string;
  approvedBorrowSignatureData: string;
  approvedBorrowAtIso: string | null;
  items: ParsedAssetItem[];
  agreement: ParsedAssetAgreement | null;
};

export type ParsedWorkTrackingRecord = {
  id: string;
  houseNo: string;
  round: string;
  eventDate: string;
  projectText: string;
  detail: string;
  status: WorkTrackingRecordStatus;
  deliveredDate: string | null;
  reportStatuses: Record<string, string>;
  subStatuses: WorkTrackingSubStatus[];
  workers: Record<string, WorkTrackingSession[]>;
};

export type SheetMigrationSummary = {
  employeesActive: number;
  employeesFormerStubs: number;
  employeesTotal: number;
  departments: number;
  positions: number;
  overtimeRequests: number;
  leaveRequests: number;
  assetRequests: number;
  assetItems: number;
  assetAgreements: number;
  assetAgreementSigners: number;
  assetAttachments: number;
  workTrackingRecords: number;
  hasWorkSheet: boolean;
};

export type ParsedSheetMigration = {
  data: {
    employees: ParsedEmployee[];
    departments: string[];
    positions: string[];
    overtime: ParsedOvertimeRequest[];
    leave: ParsedLeaveRequest[];
    assets: ParsedAssetRequest[];
    workTracking: ParsedWorkTrackingRecord[];
  };
  summary: SheetMigrationSummary;
  sheetsFound: string[];
  sheetsMissing: string[];
  warnings: string[];
  errors: string[];
};

type SheetCells = Map<number, unknown>;
type SheetRowEntry = { rowNumber: number; cells: SheetCells };

function unwrapCellValue(raw: unknown, depth = 0): unknown {
  if (raw == null || depth > 5) return null;
  if (raw instanceof Date || typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw !== "object") return null;

  if ("error" in raw) return null;
  if ("richText" in raw && Array.isArray((raw as { richText?: unknown }).richText)) {
    return (raw as { richText: Array<{ text?: string }> }).richText.map((part) => part.text ?? "").join("");
  }
  if ("hyperlink" in raw) {
    const record = raw as { hyperlink?: unknown; text?: unknown };
    const link = typeof record.hyperlink === "string" ? record.hyperlink.trim() : "";
    const textVal = unwrapCellValue(record.text, depth + 1);
    const textStr = typeof textVal === "string" ? textVal.trim() : "";
    if (link.toLowerCase().startsWith("mailto:")) {
      return textStr || link.slice(7);
    }
    // Google Sheets exports JSON/HTML strings containing a URL as richText-inside-hyperlink;
    // keep the fuller structured text instead of truncating to the single embedded URL.
    if (
      textStr &&
      (textStr.startsWith("{")
        || textStr.startsWith("[")
        || textStr.startsWith("<")
        || (link && textStr.length > link.length && textStr.includes(link)))
    ) {
      return textStr;
    }
    if (/^https?:\/\//i.test(link)) {
      return /^https?:\/\//i.test(textStr) ? textStr : link;
    }
    return textStr || link || null;
  }
  if ("result" in raw) {
    return unwrapCellValue((raw as { result?: unknown }).result, depth + 1);
  }
  if ("text" in raw) {
    return unwrapCellValue((raw as { text?: unknown }).text, depth + 1);
  }
  return null;
}

function readWorksheetRows(worksheet: ExcelJS.Worksheet): SheetRowEntry[] {
  const rows: SheetRowEntry[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: SheetCells = new Map();
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const val = unwrapCellValue(cell.value);
      if (val !== null && val !== "") {
        cells.set(colNumber - 1, val);
      }
    });
    if (cells.size > 0) {
      rows.push({ rowNumber, cells });
    }
  });
  return rows;
}

export function clean(value: unknown): string | null {
  if (value == null) return null;
  let normalized = value;
  if (typeof normalized === "number") {
    if (!Number.isFinite(normalized)) return null;
    if (Number.isInteger(normalized)) normalized = Math.trunc(normalized);
  }
  const text = String(normalized)
    .replace(/\0/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return text || null;
}

export function cleanMultiline(value: unknown): string | null {
  if (value == null) return null;
  const lines = String(value)
    .replace(/\0/g, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());
  const text = lines.join("\n").trim();
  return text || null;
}

function cleanRawText(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\0/g, "").replace(/\r/g, "").trim();
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength).trim();
}

export function parseEmployeeCode(value: unknown): string | null {
  const text = clean(value);
  if (text === null) return null;
  const stripped = /^\d+\.0+$/.test(text) ? text.split(".")[0] : text;
  return /^\d{1,4}$/.test(stripped) ? stripped.padStart(4, "0") : stripped;
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const idx = fullName.indexOf(" ");
  if (idx === -1) return { firstName: fullName, lastName: "" };
  return { firstName: fullName.slice(0, idx), lastName: fullName.slice(idx + 1) };
}

function formatUtcDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeGregorianYear(year: number): number {
  return year > 2400 ? year - 543 : year;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() + 1 === month && check.getUTCDate() === day;
}

export function parseExcelDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatUtcDate(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const ms = Math.round(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return formatUtcDate(new Date(ms));
  }
  const text = clean(value);
  if (!text) return null;
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/.exec(text);
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T].*)?$/.exec(text);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = normalizeGregorianYear(Number(iso[1]));
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = normalizeGregorianYear(Number(dmy[3]));
  } else {
    return null;
  }
  if (!isValidYmd(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseExcelTimeMinutes(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.getUTCHours() * 60 + Math.round((value.getUTCMinutes() * 60 + value.getUTCSeconds()) / 60);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const fraction = value >= 1 ? value - Math.floor(value) : value;
    if (fraction < 0) return null;
    return Math.round(fraction * 1440);
  }
  const text = clean(value);
  if (!text) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 24 || minutes > 59 || seconds > 59) return null;
  return hours * 60 + Math.round((minutes * 60 + seconds) / 60);
}

export function bangkokDateTime(dateIso: string, minutesFromMidnight: number): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  const utcMs = Date.UTC(year, month - 1, day, 0, minutesFromMidnight, 0, 0) - 7 * 3_600_000;
  return new Date(utcMs);
}

export function parseExcelDateTime(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const dateIso = formatUtcDate(value);
    const mins = value.getUTCHours() * 60 + value.getUTCMinutes();
    return bangkokDateTime(dateIso, mins);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const ms = Math.round(Date.UTC(1899, 11, 30) + value * 86_400_000);
    const utc = new Date(ms);
    const dateIso = formatUtcDate(utc);
    const mins = utc.getUTCHours() * 60 + Math.round((utc.getUTCMinutes() * 60 + utc.getUTCSeconds()) / 60);
    return bangkokDateTime(dateIso, mins);
  }
  const text = clean(value);
  if (!text) return null;
  const dateIso = parseExcelDate(text);
  if (!dateIso) return null;
  const timeMatch = /(?:[ T])(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  const mins = timeMatch ? Number(timeMatch[1]) * 60 + Number(timeMatch[2]) : 0;
  return bangkokDateTime(dateIso, mins);
}

function parseIsoTimestamp(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const text = clean(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function deterministicUuid(...parts: unknown[]): string {
  const namespaceBytes = Buffer.from(UUID_NAMESPACE.replace(/-/g, ""), "hex");
  const name = parts.map((part) => String(part ?? "")).join("|");
  const hash = createHash("sha1").update(namespaceBytes).update(name, "utf8").digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function parseWeeklyHolidays(text: string | null, code: string, warnings: string[]): number[] {
  const days: number[] = [];
  for (const token of (text ?? "").split(/[,\s]+/)) {
    if (!token) continue;
    const index = WEEKDAY_INDEX[token.toLowerCase()];
    if (index === undefined) {
      warnings.push(`[employees] รหัส ${code}: ไม่รู้จักวันหยุด "${token}" (ข้าม)`);
    } else if (!days.includes(index)) {
      days.push(index);
    }
  }
  return days.sort((a, b) => a - b);
}

function buildEmployeesFromRows(
  rows: SheetRowEntry[],
  warnings: string[],
  errors: string[],
): Map<string, ParsedEmployee> {
  const COL_NAME = 0;
  const COL_CODE = 1;
  const COL_DEPARTMENT = 2;
  const COL_AVATAR = 3;
  const COL_EMAIL = 4;
  const COL_POSITION = 5;
  const COL_PHONE = 6;
  const COL_WEEKLY_HOLIDAYS = 7;
  const COL_START_DATE = 8;
  const COL_LINE_UID = 11;
  const COL_BIRTH_DATE = 16;
  const COL_PREFIX = 17;
  const COL_EMPLOYMENT_TYPE = 18;
  const COL_STATUS = 19;

  const employeesByCode = new Map<string, ParsedEmployee>();

  for (const { rowNumber, cells } of rows.slice(1)) {
    const code = parseEmployeeCode(cells.get(COL_CODE));
    const name = clean(cells.get(COL_NAME));
    if (!code && !name) continue;
    if (code && EXCLUDED_EMPLOYEE_CODES.has(code)) {
      warnings.push(`[employees] แถว ${rowNumber}: ข้ามรหัสทดสอบ/ระบบ ${code} (${name ?? ""})`);
      continue;
    }
    if (!code || !/^\d{4}$/.test(code)) {
      warnings.push(`[employees] แถว ${rowNumber}: รหัสพนักงานไม่ถูกต้อง "${code ?? ""}" (${name ?? ""}) — ข้าม`);
      continue;
    }
    if (!name) {
      warnings.push(`[employees] แถว ${rowNumber}: รหัส ${code} ไม่มีชื่อ — ข้าม`);
      continue;
    }
    const startDate = parseExcelDate(cells.get(COL_START_DATE));
    if (!startDate) {
      warnings.push(`[employees] แถว ${rowNumber}: รหัส ${code} ไม่มีวันเริ่มงาน — ข้าม`);
      continue;
    }

    const { firstName, lastName } = splitName(name);
    if (!lastName) {
      warnings.push(`[employees] แถว ${rowNumber}: รหัส ${code} ชื่อ "${name}" ไม่มีนามสกุล`);
    }
    const startYear = Number(startDate.slice(0, 4));
    if (startYear < PLACEHOLDER_START_YEAR) {
      warnings.push(`[employees] รหัส ${code} (${name}): วันเริ่มงาน ${startDate} เก่าผิดปกติ กรุณาตรวจสอบ`);
    }
    if (employeesByCode.has(code)) {
      warnings.push(`[employees] แถว ${rowNumber}: รหัสพนักงานซ้ำ ${code} — ข้าม`);
      continue;
    }

    const rawPrefix = clean(cells.get(COL_PREFIX));
    const prefix = rawPrefix ? (PREFIX_ALIASES[rawPrefix] ?? rawPrefix) : null;
    const rawEmail = clean(cells.get(COL_EMAIL));

    const rawEmpType = clean(cells.get(COL_EMPLOYMENT_TYPE));
    let employmentTypeCode: string | null = null;
    if (rawEmpType) {
      employmentTypeCode = EMPLOYMENT_TYPE_BY_SHEET_TEXT[rawEmpType.toLowerCase()]
        ?? EMPLOYMENT_TYPE_BY_SHEET_TEXT[rawEmpType]
        ?? null;
      if (!employmentTypeCode) {
        warnings.push(`[employees] แถว ${rowNumber}: รหัส ${code} ไม่รู้จักประเภทว่าจ้าง "${rawEmpType}" — เว้นว่าง`);
      }
    }

    const rawStatus = clean(cells.get(COL_STATUS));
    let isFormerStub = false;
    if (rawStatus) {
      const lowerStatus = rawStatus.toLowerCase();
      if (FORMER_EMPLOYEE_STATUS_TEXT.has(rawStatus) || FORMER_EMPLOYEE_STATUS_TEXT.has(lowerStatus)) {
        isFormerStub = true;
      } else if (!ACTIVE_EMPLOYEE_STATUS_TEXT.has(rawStatus) && !ACTIVE_EMPLOYEE_STATUS_TEXT.has(lowerStatus)) {
        warnings.push(`[employees] แถว ${rowNumber}: รหัส ${code} ไม่รู้จักสถานะ "${rawStatus}" — กำหนดเป็นปฏิบัติงาน`);
      }
    }

    employeesByCode.set(code, {
      code,
      name,
      prefix,
      firstName,
      lastName,
      startDate,
      email: rawEmail ? rawEmail.toLowerCase() : null,
      phone: clean(cells.get(COL_PHONE)),
      avatarUrl: clean(cells.get(COL_AVATAR)),
      lineUid: clean(cells.get(COL_LINE_UID)),
      birthDate: parseExcelDate(cells.get(COL_BIRTH_DATE)),
      weeklyHolidays: parseWeeklyHolidays(clean(cells.get(COL_WEEKLY_HOLIDAYS)), code, warnings),
      department: clean(cells.get(COL_DEPARTMENT)),
      position: clean(cells.get(COL_POSITION)),
      employmentTypeCode,
      isFormerStub,
    });
  }

  const emailOwners = new Map<string, string[]>();
  const lineOwners = new Map<string, string[]>();
  for (const emp of employeesByCode.values()) {
    if (emp.email) {
      emailOwners.set(emp.email, [...(emailOwners.get(emp.email) ?? []), emp.code]);
    }
    if (emp.lineUid) {
      lineOwners.set(emp.lineUid, [...(lineOwners.get(emp.lineUid) ?? []), emp.code]);
    }
  }
  for (const [email, codes] of emailOwners) {
    if (codes.length > 1) {
      errors.push(`[employees] อีเมลซ้ำ "${email}" ใช้โดยรหัสพนักงาน: ${codes.join(", ")}`);
    }
  }
  for (const [lineUid, codes] of lineOwners) {
    if (codes.length > 1) {
      errors.push(`[employees] LINE UID ซ้ำ "${lineUid}" ใช้โดยรหัสพนักงาน: ${codes.join(", ")}`);
    }
  }

  return employeesByCode;
}

type ApproverFinder = (name: string | null, email?: string | null) => string | null;

function makeApproverFinder(employeesByCode: Map<string, ParsedEmployee>): ApproverFinder {
  const byName = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const [code, emp] of employeesByCode) {
    byName.set(emp.name.toLowerCase(), code);
    if (emp.email) byEmail.set(emp.email, code);
  }
  return (name: string | null, email: string | null = null) => {
    if (email && byEmail.has(email.toLowerCase())) {
      return byEmail.get(email.toLowerCase())!;
    }
    if (name) {
      const key = name.trim().replace(/\s+/g, " ").toLowerCase();
      return byName.get(key) ?? APPROVER_ALIASES[key] ?? null;
    }
    return null;
  };
}

type RawOtRow = {
  sheetRow: number;
  employeeName: string;
  employeeCode: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
  reason: string | null;
  decidedByCode: string | null;
  decisionNote: string | null;
};

function buildOvertimeRows(
  rows: SheetRowEntry[],
  employeesByCode: Map<string, ParsedEmployee>,
  findApprover: ApproverFinder,
  warnings: string[],
): RawOtRow[] {
  const COL_DATE = 0;
  const COL_START_TIME = 1;
  const COL_END_TIME = 2;
  const COL_EMPLOYEE_NAME = 4;
  const COL_NOTE = 5;
  const COL_STATUS = 6;
  const COL_APPROVED_BY = 8;
  const COL_APPROVER_COMMENT = 9;

  const codeByName = new Map<string, string>();
  for (const [code, emp] of employeesByCode) {
    codeByName.set(emp.name, code);
  }

  const result: RawOtRow[] = [];
  const seen = new Set<string>();

  for (const { rowNumber, cells } of rows.slice(1)) {
    const name = clean(cells.get(COL_EMPLOYEE_NAME));
    const dateIso = parseExcelDate(cells.get(COL_DATE));
    if (!name || !dateIso) continue;

    const startMins = parseExcelTimeMinutes(cells.get(COL_START_TIME));
    const endMinsRaw = parseExcelTimeMinutes(cells.get(COL_END_TIME));
    if (startMins === null || endMinsRaw === null) {
      warnings.push(`[ot] แถว ${rowNumber}: ${name} ${dateIso} ไม่มีเวลาเริ่ม/เลิก — ข้าม`);
      continue;
    }
    const endMins = endMinsRaw <= startMins ? endMinsRaw + 1440 : endMinsRaw;
    const startAt = bangkokDateTime(dateIso, startMins);
    const endAt = bangkokDateTime(dateIso, endMins);

    const statusText = clean(cells.get(COL_STATUS));
    let status = REQUEST_STATUS_BY_SHEET_TEXT[statusText ?? ""];
    if (!status) {
      warnings.push(`[ot] แถว ${rowNumber}: ไม่รู้จักสถานะ "${statusText ?? ""}" — นำเข้าเป็น pending`);
      status = "pending";
    }

    const approverName = clean(cells.get(COL_APPROVED_BY));
    const approverCode = approverName ? findApprover(approverName) : null;
    if (approverName && !approverCode) {
      warnings.push(`[ot] แถว ${rowNumber}: ไม่พบผู้อนุมัติ "${approverName}" — เว้นว่าง decided_by`);
    }

    const reason = cleanMultiline(cells.get(COL_NOTE));
    const identityKey = `${name}|${startAt.toISOString()}|${endAt.toISOString()}|${status}|${reason ?? ""}`;
    if (seen.has(identityKey)) {
      warnings.push(`[ot] แถว ${rowNumber}: รายการซ้ำ (${name} ${dateIso}) — ข้าม`);
      continue;
    }
    seen.add(identityKey);

    result.push({
      sheetRow: rowNumber,
      employeeName: name,
      employeeCode: codeByName.get(name) ?? null,
      startAt,
      endAt,
      status,
      reason,
      decidedByCode: DECIDED_STATUSES.has(status) ? approverCode : null,
      decisionNote: cleanMultiline(cells.get(COL_APPROVER_COMMENT)),
    });
  }

  return result;
}

function resolveLeaveSession(
  periodText: string | null,
  startOn: string,
  endOn: string,
  reason: string | null,
  rowNumber: number,
  name: string,
  warnings: string[],
): { session: "full" | "am" | "pm"; reason: string | null } {
  if (periodText !== HALF_DAY_SHEET_TEXT) {
    return { session: "full", reason };
  }
  if (startOn !== endOn) {
    warnings.push(`[leave] แถว ${rowNumber}: ลาครึ่งวันแต่ช่วงวันหลายวัน (${startOn}..${endOn}) — นำเข้าเป็น full`);
    return { session: "full", reason };
  }
  const text = reason ?? "";
  let session: "am" | "pm" = "am";
  if (text.includes("บ่าย") && !text.includes("เช้า")) {
    session = "pm";
  } else if (!text.includes("เช้า") && !text.includes("บ่าย")) {
    warnings.push(`[leave] แถว ${rowNumber}: ${name} ${startOn} ลาครึ่งวันไม่ระบุเช้า/บ่าย — กำหนดเป็น am`);
  }
  const nextReason = /^ครึ่ง(เช้า|บ่าย)(วัน)?$/.test(text) ? null : reason;
  return { session, reason: nextReason };
}

function parseLeaveApproval(
  cell: string | null,
  status: string,
  findApprover: ApproverFinder,
  rowNumber: number,
  warnings: string[],
): { approverCode: string | null; decidedAt: Date | null } {
  if (!cell || !DECIDED_STATUSES.has(status)) return { approverCode: null, decidedAt: null };
  const parts = cell.split("|").map((p) => p.trim());
  const approverCode = findApprover(parts[0] || null, parts[2] || null);
  if (!approverCode && parts[0]) {
    warnings.push(`[leave] แถว ${rowNumber}: ไม่พบผู้อนุมัติ "${parts[0]}" — เว้นว่าง decided_by`);
  }
  let decidedAt: Date | null = null;
  if (parts[1] && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(parts[1])) {
    const [d, m, y] = parts[1].split("/").map(Number);
    const year = normalizeGregorianYear(y);
    if (isValidYmd(year, m, d)) {
      const dateIso = `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      decidedAt = bangkokDateTime(dateIso, LEAVE_DECISION_HOUR * 60);
    }
  }
  return { approverCode, decidedAt };
}

function buildLeaveRequests(
  rows: SheetRowEntry[],
  employeesByCode: Map<string, ParsedEmployee>,
  findApprover: ApproverFinder,
  warnings: string[],
): ParsedLeaveRequest[] {
  const COL_NAME = 0;
  const COL_TYPE = 1;
  const COL_PERIOD = 2;
  const COL_START = 3;
  const COL_END = 4;
  const COL_REASON = 5;
  const COL_ATTACHMENT = 6;
  const COL_STATUS = 7;
  const COL_CODE = 8;
  const COL_APPROVED_BY = 10;
  const COL_APPROVER_COMMENT = 11;

  const result: ParsedLeaveRequest[] = [];
  const seen = new Set<string>();

  for (const { rowNumber, cells } of rows.slice(1)) {
    const name = clean(cells.get(COL_NAME));
    const code = parseEmployeeCode(cells.get(COL_CODE));
    if (!name || !code || EXCLUDED_EMPLOYEE_CODES.has(code)) continue;
    if (!/^\d{4}$/.test(code)) {
      warnings.push(`[leave] แถว ${rowNumber}: รหัสพนักงานไม่ถูกต้อง "${code}" (${name}) — ข้าม`);
      continue;
    }

    const known = employeesByCode.get(code);
    if (known && known.name !== name) {
      warnings.push(`[leave] แถว ${rowNumber}: รหัส ${code} ในทะเบียนชื่อ "${known.name}" แต่ใบลาชื่อ "${name}"`);
    }

    const typeText = clean(cells.get(COL_TYPE));
    const leaveTypeCode = LEAVE_TYPE_BY_SHEET_TEXT[typeText ?? ""];
    if (!leaveTypeCode) {
      warnings.push(`[leave] แถว ${rowNumber}: ไม่รู้จักประเภทการลา "${typeText ?? ""}" — ข้าม`);
      continue;
    }

    const startOn = parseExcelDate(cells.get(COL_START));
    const endOn = parseExcelDate(cells.get(COL_END));
    if (!startOn || !endOn || endOn < startOn) {
      warnings.push(`[leave] แถว ${rowNumber}: วันที่ไม่ถูกต้อง (${startOn ?? "?"}..${endOn ?? "?"}) — ข้าม`);
      continue;
    }

    const statusText = clean(cells.get(COL_STATUS));
    let status = REQUEST_STATUS_BY_SHEET_TEXT[statusText ?? ""];
    if (!status) {
      warnings.push(`[leave] แถว ${rowNumber}: ไม่รู้จักสถานะ "${statusText ?? ""}" — นำเข้าเป็น pending`);
      status = "pending";
    }

    let { session, reason } = resolveLeaveSession(
      clean(cells.get(COL_PERIOD)),
      startOn,
      endOn,
      cleanMultiline(cells.get(COL_REASON)),
      rowNumber,
      name,
      warnings,
    );
    const attachmentRaw = clean(cells.get(COL_ATTACHMENT));
    let attachmentUrl: string | null = null;
    if (attachmentRaw) {
      if (/^https?:\/\//i.test(attachmentRaw)) {
        attachmentUrl = attachmentRaw;
      } else {
        reason = `${reason ? `${reason}\n` : ""}แนบ: ${attachmentRaw}`;
        warnings.push(`[leave] แถว ${rowNumber}: คอลัมน์รูปแนบไม่ใช่ URL (${attachmentRaw.slice(0, 40)}) — เก็บไว้ในเหตุผลแทน`);
      }
    }

    const { approverCode, decidedAt } = parseLeaveApproval(
      clean(cells.get(COL_APPROVED_BY)),
      status,
      findApprover,
      rowNumber,
      warnings,
    );

    const identityParts = [code, startOn, endOn, leaveTypeCode, session, status];
    const identityKey = identityParts.join("|");
    if (seen.has(identityKey)) {
      warnings.push(`[leave] แถว ${rowNumber}: รายการซ้ำ (${name} ${leaveTypeCode} ${startOn}..${endOn}) — ข้าม`);
      continue;
    }
    seen.add(identityKey);

    result.push({
      id: deterministicUuid("leave", ...identityParts),
      sheetRow: rowNumber,
      employeeName: name,
      employeeCode: code,
      leaveTypeCode,
      startOn,
      endOn,
      session,
      reason,
      attachmentUrl,
      status,
      decidedByCode: approverCode,
      decidedAtIso: decidedAt ? decidedAt.toISOString() : null,
      decisionNote: cleanMultiline(cells.get(COL_APPROVER_COMMENT)),
    });
  }

  return result;
}

function finalizeOvertimeAndFormerEmployees(
  rawOt: RawOtRow[],
  leave: ParsedLeaveRequest[],
  employeesByCode: Map<string, ParsedEmployee>,
  warnings: string[],
): ParsedOvertimeRequest[] {
  const leaveCodeByName = new Map<string, string>();
  const leaveNameByCode = new Map<string, string>();
  for (const r of leave) {
    leaveCodeByName.set(r.employeeName, r.employeeCode);
    if (!leaveNameByCode.has(r.employeeCode)) {
      leaveNameByCode.set(r.employeeCode, r.employeeName);
    }
  }

  const matchedOt: ParsedOvertimeRequest[] = [];
  for (const row of rawOt) {
    const code = row.employeeCode ?? leaveCodeByName.get(row.employeeName) ?? null;
    if (!code || !/^\d{4}$/.test(code)) {
      warnings.push(`[ot] แถว ${row.sheetRow}: ไม่พบรหัสพนักงานสำหรับ "${row.employeeName}" — ข้ามแถวนี้`);
      continue;
    }
    const reason = row.reason || OVERTIME_DEFAULT_REASON;
    const id = deterministicUuid(
      "ot",
      row.employeeName,
      row.startAt.toISOString(),
      row.endAt.toISOString(),
      row.status,
      row.reason ?? "",
      code,
    );
    matchedOt.push({
      id,
      sheetRow: row.sheetRow,
      employeeName: row.employeeName,
      employeeCode: code,
      startAtIso: row.startAt.toISOString(),
      endAtIso: row.endAt.toISOString(),
      status: row.status,
      reason,
      decidedByCode: row.decidedByCode,
      decisionNote: row.decisionNote,
    });
  }

  const activityDatesByCode = new Map<string, string[]>();
  for (const r of matchedOt) {
    const dateIso = r.startAtIso.slice(0, 10);
    activityDatesByCode.set(r.employeeCode, [...(activityDatesByCode.get(r.employeeCode) ?? []), dateIso]);
  }
  for (const r of leave) {
    activityDatesByCode.set(r.employeeCode, [...(activityDatesByCode.get(r.employeeCode) ?? []), r.startOn]);
  }

  const sortedCodes = [...activityDatesByCode.keys()].sort();
  for (const code of sortedCodes) {
    if (employeesByCode.has(code)) continue;
    const dates = activityDatesByCode.get(code)!;
    const earliest = [...dates].sort()[0];
    const name = leaveNameByCode.get(code)
      ?? matchedOt.find((r) => r.employeeCode === code)?.employeeName
      ?? code;
    const { firstName, lastName } = splitName(name);
    employeesByCode.set(code, {
      code,
      name,
      prefix: null,
      firstName,
      lastName,
      startDate: earliest,
      email: null,
      phone: null,
      avatarUrl: null,
      lineUid: null,
      birthDate: null,
      weeklyHolidays: [],
      department: null,
      position: null,
      employmentTypeCode: null,
      isFormerStub: true,
    });
    warnings.push(
      `[employees] รหัส ${code} (${name}): มีประวัติ OT/ลา ${dates.length} รายการแต่ไม่อยู่ในทะเบียนพนักงาน — สร้างเป็นพนักงาน "พ้นสภาพ" (เริ่มงาน ${earliest})`,
    );
  }

  return matchedOt;
}

function parseAssetItemsCell(cell: unknown): ParsedAssetItem[] {
  const items: ParsedAssetItem[] = [];
  for (const line of String(cell ?? "").replace(/\r/g, "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes("|")) {
      const parts = trimmed.split("|").map((p) => p.trim());
      if (!parts[0]) continue;
      const rawQty = parts[1] ? Number.parseFloat(parts[1]) : 1;
      const quantity = Number.isFinite(rawQty) && rawQty >= 1 ? Math.trunc(rawQty) : 1;
      items.push({
        name: parts[0],
        quantity,
        note: parts[2] ?? "",
      });
      continue;
    }
    const legacyMatch = /^(.+?)\s*\((\d+)\)\s*$/.exec(trimmed);
    if (legacyMatch) {
      const name = legacyMatch[1].trim();
      const rawQty = Number.parseInt(legacyMatch[2], 10);
      if (name) {
        items.push({
          name,
          quantity: Number.isFinite(rawQty) && rawQty >= 1 ? rawQty : 1,
          note: "",
        });
      }
      continue;
    }
    items.push({ name: trimmed, quantity: 1, note: "" });
  }
  return items;
}

function parseAttachmentUrls(value: unknown): string[] {
  const raw = cleanMultiline(value);
  if (!raw) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const token of raw.split(/[\n,]+/)) {
    const cleaned = token.trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    urls.push(cleaned);
  }
  return urls;
}

function parsePercentCoord(value: unknown): string | null {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  if (!Number.isFinite(num) || num < 0 || num > 100) return null;
  return String(Number(num.toFixed(2)));
}

function parseAssetAgreement(
  params: {
    requestId: string;
    rowNumber: number;
    title: string;
    bodyHtml: string;
    signatureRaw: unknown;
    fromDate: string;
    agreementUpdatedAt: Date | null;
    employeesByCode: Map<string, ParsedEmployee>;
    findApprover: ApproverFinder;
    warnings: string[];
  },
): ParsedAssetAgreement | null {
  const {
    requestId,
    rowNumber,
    title,
    bodyHtml,
    signatureRaw,
    fromDate,
    agreementUpdatedAt,
    employeesByCode,
    findApprover,
    warnings,
  } = params;

  if (!title && !bodyHtml) return null;
  if (!title || !bodyHtml) {
    warnings.push(`[assets] แถว ${rowNumber}: ข้อมูล Agreement ไม่สมบูรณ์ (ขาดหัวข้อหรือเนื้อหา) — ข้ามส่วน Agreement`);
    return null;
  }

  let meta: Record<string, unknown> = {};
  const sigText = cleanRawText(signatureRaw);
  if (sigText) {
    try {
      const parsedJson: unknown = JSON.parse(sigText);
      if (parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)) {
        meta = parsedJson as Record<string, unknown>;
      } else {
        warnings.push(`[assets] แถว ${rowNumber}: ตำแหน่งลายเซ็นไม่ใช่ JSON object — ใช้ค่าเริ่มต้น`);
      }
    } catch {
      warnings.push(`[assets] แถว ${rowNumber}: ไม่สามารถอ่าน JSON ตำแหน่งลายเซ็นได้ — นำเข้า Agreement โดยไม่มีกล่องลายเซ็น`);
    }
  }

  const rawBoxes = Array.isArray(meta.signatureBoxes) ? meta.signatureBoxes : [];
  const seenBoxIds = new Set<string>();
  const signers: ParsedAssetAgreementSigner[] = [];
  const domainBoxes: AssetSignatureBox[] = [];

  rawBoxes.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const rawBox = entry as Record<string, unknown>;

    let boxId = truncateText(clean(rawBox.id) ?? `box-${index}`, 100);
    if (seenBoxIds.has(boxId)) {
      boxId = truncateText(`${boxId}-${index}`, 100);
    }
    seenBoxIds.add(boxId);

    const signerKindRaw = clean(rawBox.signer);
    const inferredSignerKind: AssetSignatureSigner = boxId === "employee" || boxId.startsWith("employee-")
      ? "employee"
      : boxId === "handover" || boxId.startsWith("handover-")
        ? "other"
        : "admin";
    const signerKind: AssetSignatureSigner = signerKindRaw && VALID_SIGNER_KINDS.has(signerKindRaw as AssetSignatureSigner)
      ? (signerKindRaw as AssetSignatureSigner)
      : inferredSignerKind;

    const participant = agreementParticipantForSignatureBox({ id: boxId, signer: signerKind });

    const layoutRaw = clean(rawBox.position);
    const layoutPosition: AssetSignaturePosition = layoutRaw && VALID_LAYOUT_POSITIONS.has(layoutRaw as AssetSignaturePosition)
      ? (layoutRaw as AssetSignaturePosition)
      : "bottom-left";

    const page = rawBox.page === 2 || rawBox.page === 3 ? rawBox.page : null;
    const xPercent = parsePercentCoord(rawBox.x);
    const yPercent = parsePercentCoord(rawBox.y);

    const signatureData = cleanRawText(rawBox.signatureData) || null;
    const rawSigStatus = clean(rawBox.status);
    const signatureStatus: AssetSignatureStatus = rawSigStatus && VALID_SIGNATURE_STATUSES.has(rawSigStatus as AssetSignatureStatus)
      ? (rawSigStatus as AssetSignatureStatus)
      : signatureData
        ? "signed"
        : "pending";

    const signerName = truncateText(clean(rawBox.name) ?? "", 255);
    const label = truncateText(clean(rawBox.label) ?? clean(rawBox.role) ?? boxId, 255);
    const role = truncateText(clean(rawBox.role) ?? label, 255);

    const signedAt = parseIsoTimestamp(rawBox.signedAt);
    const signedAtIso = signedAt ? signedAt.toISOString() : null;
    const signedByCode = signatureStatus === "signed" && signerName ? findApprover(signerName) : null;
    const signedByName = signatureStatus === "signed" ? signerName : "";

    const returnSignatureData = cleanRawText(rawBox.returnSignatureData) || null;
    const returnSignedAt = parseIsoTimestamp(rawBox.returnSignedAt);
    const returnSignedAtIso = returnSignedAt ? returnSignedAt.toISOString() : null;
    const returnSignedByCode = returnSignatureData && signerName ? findApprover(signerName) : null;
    const returnSignedByName = returnSignatureData ? signerName : "";

    signers.push({
      boxId,
      position: signers.length,
      participant,
      label,
      role,
      signerKind,
      signerName,
      layoutPosition,
      page,
      xPercent,
      yPercent,
      signatureData,
      signatureStatus,
      signedByCode,
      signedByName,
      signedAtIso,
      returnSignatureData,
      returnSignedByCode,
      returnSignedByName,
      returnSignedAtIso,
    });

    domainBoxes.push({
      id: boxId,
      label,
      role,
      name: signerName,
      signer: signerKind,
      position: layoutPosition,
      ...(page ? { page } : {}),
      ...(xPercent !== null ? { x: Number(xPercent) } : {}),
      ...(yPercent !== null ? { y: Number(yPercent) } : {}),
      ...(signatureData ? { signatureData } : {}),
      ...(returnSignatureData ? { returnSignatureData } : {}),
      ...(returnSignedAtIso ? { returnSignedAt: returnSignedAtIso } : {}),
      status: signatureStatus,
      signedAt: signedAtIso,
    });
  });

  const rawAgreementType = clean(meta.type);
  const type: DbAgreementType = rawAgreementType === "assetForm" || rawAgreementType === "asset_form" || title === "Asset Form"
    ? "asset_form"
    : "borrow";

  const rawStatus = clean(meta.status);
  const derivedStatus = AGREEMENT_STATUS_TO_DB[nextAgreementStatus(domainBoxes)];
  const status: DbAgreementStatus = rawStatus && AGREEMENT_STATUS_MAP[rawStatus]
    ? AGREEMENT_STATUS_MAP[rawStatus]
    : derivedStatus;

  const rawReturnCondition = clean(meta.returnCondition);
  const returnCondition: DbReturnCondition | null =
    rawReturnCondition && VALID_RETURN_CONDITIONS.has(rawReturnCondition as DbReturnCondition)
      ? (rawReturnCondition as DbReturnCondition)
      : null;

  const parsedCreatorCode = parseEmployeeCode(meta.createdByCode);
  const createdByRawCode = parsedCreatorCode && parsedCreatorCode.length === 4 ? parsedCreatorCode : "";
  if (clean(meta.createdByCode) && !createdByRawCode) {
    warnings.push(`[assets] แถว ${rowNumber}: createdByCode ใน Agreement ("${clean(meta.createdByCode)}") ไม่ใช่ 4 ตัวอักษร — เก็บเป็นค่าว่าง`);
  }
  const createdByCode = createdByRawCode && employeesByCode.has(createdByRawCode)
    ? createdByRawCode
    : null;
  const createdByName = truncateText(clean(meta.createdBy) ?? "", 255);

  return {
    id: deterministicUuid("asset-agreement", requestId),
    type,
    title,
    headerHtml: cleanRawText(meta.header),
    bodyHtml,
    footerHtml: cleanRawText(meta.footer),
    status,
    createdByCode,
    createdByRawCode,
    createdByName,
    returnCondition,
    documentDate: fromDate,
    updatedAtIso: agreementUpdatedAt ? agreementUpdatedAt.toISOString() : null,
    signers,
  };
}

function buildAssets(
  rows: SheetRowEntry[],
  employeesByCode: Map<string, ParsedEmployee>,
  findApprover: ApproverFinder,
  warnings: string[],
): ParsedAssetRequest[] {
  const COL_ID = 0;
  const COL_FORM_DATE = 1;
  const COL_POSITION = 3;
  const COL_CODE = 4;
  const COL_REASON = 5;
  const COL_FROM = 6;
  const COL_TO = 7;
  const COL_ITEMS = 8;
  const COL_REMARKS = 9;
  const COL_STATUS = 10;
  const COL_APPROVED_BY = 11;
  const COL_RETURN_INSPECTOR = 12;
  const COL_APPROVED_RETURN_BY = 13;
  const COL_REQUEST_IMAGE = 14;
  const COL_ADDITIONAL_IMAGES = 16;
  const COL_AGREEMENT_TITLE = 18;
  const COL_AGREEMENT_BODY = 19;
  const COL_SIGNATURE_JSON = 20;
  const COL_REQUEST_UPDATED_AT = 21;
  const COL_AGREEMENT_UPDATED_AT = 22;
  const COL_DEPARTMENT = 23;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const requests: ParsedAssetRequest[] = [];
  const seenIds = new Set<string>();

  for (const { rowNumber, cells } of rows.slice(1)) {
    const sheetId = clean(cells.get(COL_ID));
    if (!sheetId) continue;
    if (!UUID_RE.test(sheetId)) {
      warnings.push(`[assets] แถว ${rowNumber}: ID "${sheetId}" ไม่ใช่ UUID — ข้าม`);
      continue;
    }
    const normalizedId = sheetId.toLowerCase();
    if (seenIds.has(normalizedId)) {
      warnings.push(`[assets] แถว ${rowNumber}: ID ซ้ำ "${normalizedId}" — ข้าม`);
      continue;
    }

    const code = parseEmployeeCode(cells.get(COL_CODE));
    const employee = code ? employeesByCode.get(code) : undefined;
    if (!code || !employee) {
      warnings.push(`[assets] แถว ${rowNumber}: ไม่พบรหัสพนักงาน "${code ?? ""}" — ข้าม`);
      continue;
    }

    const items = parseAssetItemsCell(cells.get(COL_ITEMS));
    if (items.length === 0) {
      warnings.push(`[assets] แถว ${rowNumber}: คำขอ ${normalizedId} ไม่มีรายการทรัพย์สิน — ข้าม`);
      continue;
    }

    const statusText = clean(cells.get(COL_STATUS));
    let status = ASSET_STATUS_BY_SHEET_TEXT[statusText ?? ""];
    if (!status) {
      warnings.push(`[assets] แถว ${rowNumber}: ไม่รู้จักสถานะ "${statusText ?? ""}" — นำเข้าเป็น 'unknown'`);
      status = "unknown";
    }

    const formAt = parseExcelDateTime(cells.get(COL_FORM_DATE));
    const fromDate = parseExcelDate(cells.get(COL_FROM)) ?? (formAt ? formatUtcDate(new Date(formAt.getTime() + 7 * 3_600_000)) : null);
    if (!fromDate) {
      warnings.push(`[assets] แถว ${rowNumber}: ไม่มีวันที่เริ่มยืม — ข้าม`);
      continue;
    }
    let toDate = parseExcelDate(cells.get(COL_TO));
    if (toDate && toDate < fromDate) {
      warnings.push(`[assets] แถว ${rowNumber}: วันคืน (${toDate}) น้อยกว่าวันยืม (${fromDate}) — ล้างค่าวันคืน`);
      toDate = null;
    }

    const effectiveFormAt = formAt ?? bangkokDateTime(fromDate, 0);
    const requestUpdatedAt = parseExcelDateTime(cells.get(COL_REQUEST_UPDATED_AT));
    const agreementUpdatedAt = parseExcelDateTime(cells.get(COL_AGREEMENT_UPDATED_AT));
    const updatedAt = agreementUpdatedAt ?? requestUpdatedAt ?? effectiveFormAt;

    const approverName = truncateText(clean(cells.get(COL_APPROVED_BY)) ?? "", 255);
    const approverCode = approverName ? findApprover(approverName) : null;
    const returnInspectorName = truncateText(clean(cells.get(COL_RETURN_INSPECTOR)) ?? "", 255);
    const returnInspectorCode = returnInspectorName ? findApprover(returnInspectorName) : null;
    const approvedReturnByName = truncateText(clean(cells.get(COL_APPROVED_RETURN_BY)) ?? "", 255);
    const approvedReturnByCode = approvedReturnByName ? findApprover(approvedReturnByName) : null;

    const agreement = parseAssetAgreement({
      requestId: normalizedId,
      rowNumber,
      title: cleanRawText(cells.get(COL_AGREEMENT_TITLE)),
      bodyHtml: cleanRawText(cells.get(COL_AGREEMENT_BODY)),
      signatureRaw: cells.get(COL_SIGNATURE_JSON),
      fromDate,
      agreementUpdatedAt: agreementUpdatedAt ?? requestUpdatedAt,
      employeesByCode,
      findApprover,
      warnings,
    });

    const employeeSigner = agreement?.signers.find((s) => s.participant === "employee" && s.signatureStatus === "signed");
    const adminSigner = agreement?.signers.find((s) => s.participant === "admin" && s.signatureStatus === "signed");

    seenIds.add(normalizedId);
    requests.push({
      sheetId: normalizedId,
      employeeCode: code,
      position: truncateText(clean(cells.get(COL_POSITION)) ?? "", 255),
      department: truncateText(clean(cells.get(COL_DEPARTMENT)) ?? employee.department ?? "", 255),
      formAtIso: effectiveFormAt.toISOString(),
      updatedAtIso: updatedAt.toISOString(),
      fromDate,
      toDate,
      reason: cleanMultiline(cells.get(COL_REASON)) ?? "",
      remarks: cleanMultiline(cells.get(COL_REMARKS)) ?? "",
      status,
      approverName,
      approverCode,
      returnInspectorName,
      returnInspectorCode,
      approvedReturnByName,
      approvedReturnByCode,
      requestAttachments: parseAttachmentUrls(cells.get(COL_REQUEST_IMAGE)),
      additionalAttachments: parseAttachmentUrls(cells.get(COL_ADDITIONAL_IMAGES)),
      borrowerSignatureData: employeeSigner?.signatureData ?? "",
      approvedBorrowSignatureData: adminSigner?.signatureData ?? "",
      approvedBorrowAtIso: adminSigner?.signedAtIso ?? (status === "approved" ? effectiveFormAt.toISOString() : null),
      items,
      agreement,
    });
  }

  return requests;
}

function normalizeWorkStatus(raw: unknown): WorkTrackingRecordStatus | null {
  const text = clean(raw)?.toLowerCase();
  if (!text) return null;
  return WORK_STATUS_NORMALIZATION[text] ?? null;
}

function deriveWorkStatus(
  subStatuses: readonly WorkTrackingSubStatus[],
  fallback: WorkTrackingRecordStatus = "in_progress",
): WorkTrackingRecordStatus {
  if (subStatuses.length === 0) return fallback;
  if (subStatuses.every((sub) => sub.status === "delivered")) return "delivered";
  if (subStatuses.every((sub) => sub.status === "completed" || sub.status === "delivered")) return "completed";
  return "in_progress";
}

function computeDeliveredDateIso(eventDateIso: string, round: string): string {
  const roundNumber = Number.parseInt(round.match(/\d+/)?.[0] ?? "", 10);
  const dayOffset = roundNumber === 1 ? 5 : 3;
  const [year, month, day] = eventDateIso.split("-").map(Number);
  return formatUtcDate(new Date(Date.UTC(year, month - 1, day + dayOffset)));
}

function parseWorkSubStatuses(raw: unknown, rowNumber: number, warnings: string[]): WorkTrackingSubStatus[] {
  const text = cleanRawText(raw);
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      warnings.push(`[work] แถว ${rowNumber}: สถานะย่อยไม่ใช่ JSON array — ใช้ค่าว่าง`);
      return [];
    }
    const items: WorkTrackingSubStatus[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const detail = clean(record.detail) ?? "";
      const status = normalizeWorkStatus(record.status) ?? "in_progress";
      let reportStatuses: Record<string, string> | undefined;
      if (record.reportStatuses && typeof record.reportStatuses === "object" && !Array.isArray(record.reportStatuses)) {
        const sanitized = Object.fromEntries(
          Object.entries(record.reportStatuses).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>;
        if (Object.keys(sanitized).length > 0) reportStatuses = sanitized;
      }
      items.push({
        detail,
        status,
        ...(reportStatuses ? { reportStatuses } : {}),
      });
    }
    return items;
  } catch {
    warnings.push(`[work] แถว ${rowNumber}: ไม่สามารถอ่าน JSON สถานะย่อยได้ — ใช้ค่าว่าง`);
    return [];
  }
}

function parseWorkWorkers(raw: unknown, rowNumber: number, warnings: string[]): Record<string, WorkTrackingSession[]> {
  const text = cleanRawText(raw);
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      warnings.push(`[work] แถว ${rowNumber}: ข้อมูลผู้ปฏิบัติงานไม่ใช่ JSON object — ใช้ค่าว่าง`);
      return {};
    }
    const workers: Record<string, WorkTrackingSession[]> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      workers[key] = value
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((session) => ({
          date: clean(session.date) ?? "",
          time: clean(session.time) ?? "",
          name: clean(session.name) ?? "",
          ...(clean(session.nickname) ? { nickname: clean(session.nickname)! } : {}),
          items: Array.isArray(session.items) ? session.items.map((item) => String(item ?? "").trim()).filter(Boolean) : [],
        }));
    }
    return workers;
  } catch {
    warnings.push(`[work] แถว ${rowNumber}: ไม่สามารถอ่าน JSON ผู้ปฏิบัติงานได้ — ใช้ค่าว่าง`);
    return {};
  }
}

function resolveWorkHouseNo(
  rawHouse: unknown,
  workers: Record<string, WorkTrackingSession[]>,
  projectText: string,
  rowNumber: number,
  warnings: string[],
): string | null {
  let dateMonthDay: { month: number; day: number } | null = null;
  if (rawHouse instanceof Date && !Number.isNaN(rawHouse.getTime())) {
    dateMonthDay = { month: rawHouse.getUTCMonth() + 1, day: rawHouse.getUTCDate() };
  } else if (typeof rawHouse === "string") {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(rawHouse.trim());
    if (isoMatch) {
      dateMonthDay = { month: Number(isoMatch[2]), day: Number(isoMatch[3]) };
    }
  }

  if (dateMonthDay) {
    const dm = `${dateMonthDay.day}/${dateMonthDay.month}`;
    const md = `${dateMonthDay.month}/${dateMonthDay.day}`;
    const haystack = [
      projectText,
      ...Object.values(workers).flatMap((sessions) => sessions.flatMap((s) => s.items)),
    ].join("\n");
    const recovered = !haystack.includes(dm) && haystack.includes(md) ? md : dm;
    warnings.push(`[work] แถว ${rowNumber}: เลขที่บ้านถูก Excel แปลงเป็นวันที่ — กู้คืนเป็น "${recovered}"`);
    return recovered;
  }

  const text = clean(rawHouse);
  if (!text) return null;
  if (text.length > 120) {
    warnings.push(`[work] แถว ${rowNumber}: เลขที่บ้าน "${text.slice(0, 30)}..." ยาวเกิน 120 ตัวอักษร — ตัดให้พอดี`);
    return text.slice(0, 120).trim();
  }
  return text;
}

function summarizeWorkDetail(subStatuses: readonly WorkTrackingSubStatus[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const sub of subStatuses) {
    const d = sub.detail.trim();
    if (!d || d === "-" || seen.has(d)) continue;
    seen.add(d);
    parts.push(d);
  }
  return parts.join(", ");
}

function mergeReportStatuses(subStatuses: readonly WorkTrackingSubStatus[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const sub of subStatuses) {
    if (!sub.reportStatuses) continue;
    for (const [key, value] of Object.entries(sub.reportStatuses)) {
      if (typeof value === "string" && value) merged[key] = value;
    }
  }
  return merged;
}

function mergeWorkRecords(existing: ParsedWorkTrackingRecord, incoming: ParsedWorkTrackingRecord): ParsedWorkTrackingRecord {
  const subStatuses = [...existing.subStatuses, ...incoming.subStatuses];
  const mergedWorkers: Record<string, WorkTrackingSession[]> = { ...existing.workers };
  for (const [code, sessions] of Object.entries(incoming.workers)) {
    const prev = mergedWorkers[code] ?? [];
    const seenJson = new Set(prev.map((s) => JSON.stringify(s)));
    const next = [...prev];
    for (const session of sessions) {
      const encoded = JSON.stringify(session);
      if (!seenJson.has(encoded)) {
        seenJson.add(encoded);
        next.push(session);
      }
    }
    mergedWorkers[code] = next;
  }
  return {
    ...existing,
    projectText: existing.projectText || incoming.projectText,
    subStatuses,
    reportStatuses: { ...existing.reportStatuses, ...incoming.reportStatuses },
    detail: summarizeWorkDetail(subStatuses),
    status: subStatuses.length > 0 ? deriveWorkStatus(subStatuses, incoming.status) : incoming.status,
    deliveredDate: existing.deliveredDate ?? incoming.deliveredDate,
    workers: mergedWorkers,
  };
}

function parseWorkBlock(
  rowNumber: number,
  colOffset: number,
  cells: SheetCells,
  warnings: string[],
): ParsedWorkTrackingRecord | null {
  const rawDate = cells.get(colOffset + 0);
  const rawHouse = cells.get(colOffset + 1);
  if (rawDate == null && rawHouse == null) return null;

  const eventDate = parseExcelDate(rawDate);
  if (!eventDate) {
    warnings.push(`[work] แถว ${rowNumber}: วันที่งานไม่ถูกต้อง (${String(rawDate ?? "")}) — ข้าม`);
    return null;
  }

  const projectText = clean(cells.get(colOffset + 3)) ?? "";
  const workers = parseWorkWorkers(cells.get(colOffset + 6), rowNumber, warnings);
  const houseNo = resolveWorkHouseNo(rawHouse, workers, projectText, rowNumber, warnings);
  if (!houseNo) {
    warnings.push(`[work] แถว ${rowNumber}: ไม่มีเลขที่บ้าน — ข้าม`);
    return null;
  }

  let round = clean(cells.get(colOffset + 2)) ?? "1";
  if (round.length > 40) {
    warnings.push(`[work] แถว ${rowNumber}: รอบตรวจ "${round.slice(0, 20)}..." ยาวเกิน 40 ตัวอักษร — ตัดให้พอดี`);
    round = round.slice(0, 40).trim();
  }

  const subStatuses = parseWorkSubStatuses(cells.get(colOffset + 5), rowNumber, warnings);
  const reportStatuses = mergeReportStatuses(subStatuses);
  const detail = summarizeWorkDetail(subStatuses);

  const rawStatus = clean(cells.get(colOffset + 4));
  const parsedStatus = normalizeWorkStatus(rawStatus);
  if (rawStatus && !parsedStatus) {
    warnings.push(`[work] แถว ${rowNumber}: ไม่รู้จักสถานะงาน "${rawStatus}" — คำนวณจากสถานะย่อยแทน`);
  }
  const status = parsedStatus ?? deriveWorkStatus(subStatuses, "in_progress");

  return {
    id: deterministicUuid("work-tracking", houseNo, round, eventDate),
    houseNo,
    round,
    eventDate,
    projectText,
    detail,
    status,
    deliveredDate: computeDeliveredDateIso(eventDate, round),
    reportStatuses,
    subStatuses,
    workers,
  };
}

function buildWorkTrackingRecords(rows: SheetRowEntry[], warnings: string[]): ParsedWorkTrackingRecord[] {
  const recordsByKey = new Map<string, ParsedWorkTrackingRecord>();

  const addRecord = (record: ParsedWorkTrackingRecord | null, rowNumber: number) => {
    if (!record) return;
    const key = `${record.houseNo}|${record.round}|${record.eventDate}`;
    const existing = recordsByKey.get(key);
    if (!existing) {
      recordsByKey.set(key, record);
      return;
    }
    recordsByKey.set(key, mergeWorkRecords(existing, record));
    warnings.push(`[work] แถว ${rowNumber}: พบข้อมูลงานซ้ำ (${record.houseNo} รอบ ${record.round} วันที่ ${record.eventDate}) — รวมรายการเข้าด้วยกัน`);
  };

  for (const { rowNumber, cells } of rows.slice(1)) {
    addRecord(parseWorkBlock(rowNumber, 0, cells, warnings), rowNumber);

    // Real workbook Row 2 contains a shifted duplicate 7-column block in columns H..N (7..13).
    if (cells.get(7) != null && cells.get(8) != null) {
      warnings.push(`[work] แถว ${rowNumber}: พบข้อมูลงานเสริมในคอลัมน์ H–N — ดึงเข้าสู่ระบบให้อัตโนมัติ`);
      addRecord(parseWorkBlock(rowNumber, 7, cells, warnings), rowNumber);
    }
  }

  return [...recordsByKey.values()];
}

export async function parseAppSheetWorkbook(buffer: Buffer): Promise<ParsedSheetMigration> {
  if (!buffer || buffer.byteLength === 0) {
    throw new SheetMigrationError("ไฟล์ว่างเปล่า กรุณาเลือกไฟล์ .xlsx ใหม่", 400);
  }
  if (buffer.byteLength > MAX_MIGRATION_FILE_BYTES) {
    throw new SheetMigrationError("ไฟล์ต้องมีขนาดไม่เกิน 25 MB", 413);
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    throw new SheetMigrationError("ไม่สามารถอ่านไฟล์ Excel (.xlsx) ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx จาก Google Sheet / Excel", 400);
  }

  const sheetByName = new Map<string, ExcelJS.Worksheet>();
  for (const ws of workbook.worksheets) {
    const trimmed = ws.name.trim();
    if (!sheetByName.has(trimmed)) {
      sheetByName.set(trimmed, ws);
    }
  }

  const employeeSheet = sheetByName.get(SHEET_EMPLOYEES);
  if (!employeeSheet) {
    const foundNames = workbook.worksheets.map((ws) => ws.name).join(", ") || "ไม่มีแท็บ";
    throw new SheetMigrationError(
      `ไม่พบแท็บ "${SHEET_EMPLOYEES}" ในไฟล์ (แท็บที่พบ: ${foundNames})`,
      400,
    );
  }

  const sheetsFound: string[] = [];
  const sheetsMissing: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const name of EXPECTED_SHEETS) {
    if (sheetByName.has(name)) sheetsFound.push(name);
    else {
      sheetsMissing.push(name);
      warnings.push(`[workbook] ไม่พบแท็บ "${name}" — ข้ามข้อมูลส่วนนี้`);
    }
  }

  const employeesByCode = buildEmployeesFromRows(readWorksheetRows(employeeSheet), warnings, errors);
  const findApprover = makeApproverFinder(employeesByCode);

  const otSheet = sheetByName.get(SHEET_OVERTIME);
  const rawOt = otSheet ? buildOvertimeRows(readWorksheetRows(otSheet), employeesByCode, findApprover, warnings) : [];

  const leaveSheet = sheetByName.get(SHEET_LEAVE);
  const leave = leaveSheet ? buildLeaveRequests(readWorksheetRows(leaveSheet), employeesByCode, findApprover, warnings) : [];

  const overtime = finalizeOvertimeAndFormerEmployees(rawOt, leave, employeesByCode, warnings);

  const assetSheet = sheetByName.get(SHEET_ASSETS);
  const assets = assetSheet ? buildAssets(readWorksheetRows(assetSheet), employeesByCode, findApprover, warnings) : [];

  const workSheet = sheetByName.get(SHEET_WORK);
  const workTracking = workSheet ? buildWorkTrackingRecords(readWorksheetRows(workSheet), warnings) : [];

  const employeeList = [...employeesByCode.values()];
  const departmentsSet = new Set<string>();
  const positionsSet = new Set<string>();
  for (const e of employeeList) {
    if (e.department) departmentsSet.add(e.department);
    if (e.position) positionsSet.add(e.position);
  }
  for (const a of assets) {
    if (a.department) departmentsSet.add(a.department);
    if (a.position) positionsSet.add(a.position);
  }

  const departments = [...departmentsSet].sort((a, b) => a.localeCompare(b, "th"));
  const positions = [...positionsSet].sort((a, b) => a.localeCompare(b, "th"));

  const employeesFormerStubs = employeeList.filter((e) => e.isFormerStub).length;
  const employeesActive = employeeList.length - employeesFormerStubs;
  const assetItems = assets.reduce((sum, item) => sum + item.items.length, 0);
  const assetAgreements = assets.filter((item) => item.agreement !== null).length;
  const assetAgreementSigners = assets.reduce((sum, item) => sum + (item.agreement?.signers.length ?? 0), 0);
  const assetAttachments = assets.reduce(
    (sum, item) => sum + item.requestAttachments.length + item.additionalAttachments.length,
    0,
  );

  return {
    data: {
      employees: employeeList,
      departments,
      positions,
      overtime,
      leave,
      assets,
      workTracking,
    },
    summary: {
      employeesActive,
      employeesFormerStubs,
      employeesTotal: employeeList.length,
      departments: departments.length,
      positions: positions.length,
      overtimeRequests: overtime.length,
      leaveRequests: leave.length,
      assetRequests: assets.length,
      assetItems,
      assetAgreements,
      assetAgreementSigners,
      assetAttachments,
      workTrackingRecords: workTracking.length,
      hasWorkSheet: Boolean(workSheet),
    },
    sheetsFound,
    sheetsMissing,
    warnings,
    errors,
  };
}
