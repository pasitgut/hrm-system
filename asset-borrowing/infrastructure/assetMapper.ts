import { DataContractError } from '@/shared/lib/errors';
import {
  agreementParticipantForSignatureBox,
  assetAgreementSchema,
  assetReturnConditionSchema,
  assetRequestSchema,
  type AssetAgreement,
  type AssetCreateInput,
  type AssetRequest,
  type AssetStatus,
} from '../domain/asset';

const DATE_TIME_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
const DATE_PATTERN = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/;
const SHEETS_SERIAL_DATE_PATTERN = /^\d+(?:\.\d+)?$/;
const asString = (row: unknown[], index: number): string => String(row[index] ?? '').trim();

function parseDate(value: string): Date {
  const serial = parseSheetsSerialDate(value);
  if (serial) return serial;

  const dateTime = DATE_TIME_PATTERN.exec(value);
  const legacy = DATE_PATTERN.exec(value);
  const year = dateTime ? Number(dateTime[1]) : legacy ? Number(legacy[3]) : 0;
  const month = dateTime ? Number(dateTime[2]) : legacy ? Number(legacy[2]) : 0;
  const day = dateTime ? Number(dateTime[3]) : legacy ? Number(legacy[1]) : 0;
  const normalizedYear = year > 2500 ? year - 543 : year < 100 && year > 0 ? year + 2000 : year;
  const result = new Date(
    normalizedYear,
    month - 1,
    day,
    dateTime?.[4] ? Number(dateTime[4]) : 0,
    dateTime?.[5] ? Number(dateTime[5]) : 0,
    dateTime?.[6] ? Number(dateTime[6]) : 0,
  );
  if (
    !normalizedYear ||
    !month ||
    !day ||
    result.getFullYear() !== normalizedYear ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day
  ) {
    throw new DataContractError(`รูปแบบวันที่ AssetRequest ไม่ถูกต้อง: ${value}`);
  }
  return result;
}

function parseSheetsSerialDate(value: string): Date | null {
  if (!SHEETS_SERIAL_DATE_PATTERN.test(value)) return null;
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1 || serial > 100000) return null;

  const wholeDays = Math.floor(serial);
  const millisecondsInDay = 24 * 60 * 60 * 1000;
  const timeMilliseconds = Math.round((serial - wholeDays) * millisecondsInDay);
  const epoch = new Date(1899, 11, 30);
  const result = new Date(epoch.getTime() + wholeDays * millisecondsInDay + timeMilliseconds);
  return Number.isNaN(result.getTime()) ? null : result;
}

function parseOptionalDate(value: string): Date | null {
  return value ? parseDate(value) : null;
}

function parseAgreement(row: unknown[]): AssetAgreement | null {
  const title = asString(row, 18);
  const body = asString(row, 19);
  if (!title && !body) return null;

  let signatureBoxes: unknown[] = [];
  let header = '';
  let footer = '';
  let status = 'waitingHandover';
  let createdBy = '';
  let createdByCode = '';
  let returnCondition: 'original' | 'damaged' | 'lost' | null = null;
  try {
    const parsed = JSON.parse(asString(row, 20));
    if (Array.isArray(parsed)) {
      signatureBoxes = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const payload = parsed as {
        signatureBoxes?: unknown;
        header?: unknown;
        footer?: unknown;
        status?: unknown;
        createdBy?: unknown;
        createdByCode?: unknown;
        returnCondition?: unknown;
      };
      signatureBoxes = Array.isArray(payload.signatureBoxes) ? payload.signatureBoxes : [];
      header = typeof payload.header === 'string' ? payload.header : header;
      footer = typeof payload.footer === 'string' ? payload.footer : footer;
      status = typeof payload.status === 'string' ? payload.status : status;
      createdBy = typeof payload.createdBy === 'string' ? payload.createdBy : createdBy;
      createdByCode = typeof payload.createdByCode === 'string' ? payload.createdByCode : createdByCode;
      const parsedReturnCondition = assetReturnConditionSchema.safeParse(payload.returnCondition);
      returnCondition = parsedReturnCondition.success ? parsedReturnCondition.data : null;
    }
  } catch {
    return null;
  }

  const normalizedBoxes = signatureBoxes.map((box, index) => {
    if (!box || typeof box !== 'object') return box;
    const value = box as { id?: unknown; signer?: unknown; status?: unknown; signedAt?: unknown };
    return {
      ...box,
      signer:
        value.signer === 'employee' || value.signer === 'admin' || value.signer === 'other'
          ? value.signer
          : value.id === 'employee'
            ? 'employee'
            : 'admin',
      status: typeof value.status === 'string' ? value.status : index === 0 ? 'pending' : 'locked',
      signedAt: typeof value.signedAt === 'string' ? value.signedAt : null,
    };
  });
  const normalizedStatus =
    status === 'waitingEmployee' &&
    normalizedBoxes.some((box) => {
      if (!box || typeof box !== 'object') return false;
      const value = box as { id?: unknown; signer?: unknown; status?: unknown };
      const signer =
        value.signer === 'employee' || value.signer === 'admin' || value.signer === 'other' ? value.signer : undefined;
      return (
        typeof value.id === 'string' &&
        agreementParticipantForSignatureBox({ id: value.id, signer }) === 'handover' &&
        value.status !== 'signed'
      );
    })
      ? 'waitingHandover'
      : status;

  const result = assetAgreementSchema.safeParse({
    title,
    header,
    body,
    footer,
    signatureBoxes: normalizedBoxes,
    status: normalizedStatus,
    createdBy,
    createdByCode,
    returnCondition,
    documentDate: parseOptionalDate(asString(row, 21)) ?? new Date(),
    updatedAt: parseOptionalDate(asString(row, 22)),
  });
  return result.success ? result.data : null;
}

function parseStatus(raw: string): { status: AssetStatus; label: string } {
  const known: Record<string, AssetStatus> = {
    รอ: 'pending',
    อนุมัติ: 'approved',
    ไม่อนุมัติ: 'rejected',
    รอรับคืน: 'returnPending',
    คืนแล้ว: 'returned',
  };
  return raw in known
    ? { status: known[raw], label: raw }
    : raw
      ? { status: 'unknown', label: raw }
      : { status: 'pending', label: 'รอ' };
}

export function assetRequestIdFromRow(row: unknown[]): string {
  const id = asString(row, 0);
  if (!id) throw new DataContractError('AssetRequest ขาด id ที่จำเป็น');
  return id;
}

export function isAssetPlaceholderRow(row: unknown[]): boolean {
  return Boolean(asString(row, 0)) && [1, 6, 7].every((index) => !asString(row, index));
}

export function mapAssetRow(row: unknown[]): AssetRequest {
  const status = parseStatus(asString(row, 10));
  return assetRequestSchema.parse({
    id: assetRequestIdFromRow(row),
    formDate: parseDate(asString(row, 1)),
    employeeName: asString(row, 2),
    position: asString(row, 3),
    department: asString(row, 23),
    employeeCode: asString(row, 4),
    reason: asString(row, 5),
    fromDate: parseDate(asString(row, 6)),
    toDate: parseOptionalDate(asString(row, 7)),
    items: asString(row, 8),
    remarks: asString(row, 9),
    status: status.status,
    statusLabel: status.label,
    approvedBorrowBy: asString(row, 11),
    returnInspector: asString(row, 12),
    approvedReturnBy: asString(row, 13),
    imageUrl: asString(row, 14),
    seen: asString(row, 15).toLowerCase() === 'seen',
    additionalImages: asString(row, 16)
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean),
    approvedBorrowDate: parseOptionalDate(asString(row, 17)),
    agreement: parseAgreement(row),
  });
}

export function assetCreateRow(input: AssetCreateInput): unknown[] {
  const agreement = input.agreement;
  return [
    input.id.trim(),
    formatAssetSheetDateTime(input.formDate),
    input.employeeName.trim(),
    input.position.trim(),
    input.employeeCode.trim(),
    input.reason.trim(),
    formatAssetSheetDate(input.fromDate),
    formatAssetSheetDate(input.toDate),
    input.items.trim(),
    input.remarks.trim(),
    input.initialStatus === 'approved' ? 'อนุมัติ' : 'รอ',
    input.initialApprovedBy ?? '',
    '',
    '',
    input.imageUrl.trim(),
    'unseen',
    input.additionalImages.join('\n'),
    '',
    agreement?.title ?? '',
    agreement ? agreement.body : '',
    agreement
      ? JSON.stringify({
          signatureBoxes: agreement.signatureBoxes,
          header: agreement.header,
          footer: agreement.footer,
          status: agreement.status,
          createdBy: agreement.createdBy,
          createdByCode: agreement.createdByCode,
          returnCondition: agreement.returnCondition ?? null,
        })
      : '',
    agreement ? formatAssetSheetDateTime(agreement.documentDate) : '',
    agreement?.updatedAt ? formatAssetSheetDateTime(agreement.updatedAt) : '',
    input.department.trim(),
  ];
}

export function formatAssetSheetDateTime(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${formatAssetSheetDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatAssetSheetDate(date: Date | null): string {
  if (!date) return '';
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
