import { NextResponse } from "next/server";
import { durationHours, utcToBangkokParts } from "@/app/api/ot/_shared";

// Shared helpers for app/api/approvals/**: the combined-item DTO shape and
// the Thai short-date formatting used to build each item's `detail` string.
// Not a route itself — no HTTP method exports.

export type ApprovalType = "ot" | "leave" | "asset";

export type ApprovalItem = {
  id: string;
  type: ApprovalType;
  kind: string;
  employeeId: string;
  employeeName: string;
  detail: string;
  reason: string | null;
  submittedAt: string;
  statusCode: string;
  statusName: string;
  assetItems?: Array<{ name: string; quantity: number; note: string }>;
  requiresAssetWorkflow?: boolean;
};

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

const THAI_MONTHS_ABBR = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

// "2026-09-21" -> "21 ก.ย. 2569" (Buddhist year).
export function formatThaiDateShort(dateStr: string): string {
  const { year, month, day } = parseDateParts(dateStr);
  return `${day} ${THAI_MONTHS_ABBR[month - 1]} ${year + 543}`;
}

// Condenses a same-month range to "22–24 ก.ย. 2569"; a single-day "range"
// (startStr === endStr) to just "21 ก.ย. 2569"; anything crossing a month or
// year boundary spells out both ends in full.
export function formatThaiDateRange(startStr: string, endStr: string): string {
  if (startStr === endStr) return formatThaiDateShort(startStr);
  const start = parseDateParts(startStr);
  const end = parseDateParts(endStr);
  if (start.year === end.year && start.month === end.month) {
    return `${start.day}–${end.day} ${THAI_MONTHS_ABBR[start.month - 1]} ${start.year + 543}`;
  }
  return `${formatThaiDateShort(startStr)} – ${formatThaiDateShort(endStr)}`;
}

// "21 ก.ย. 2569 · 18:00–20:00 · 2 ชม." from OT's UTC start/end instants.
export function formatOtDetail(startAt: Date, endAt: Date): string {
  const { date, time: startTime } = utcToBangkokParts(startAt);
  const { time: endTime } = utcToBangkokParts(endAt);
  const hours = durationHours(startAt, endAt);
  return `${formatThaiDateShort(date)} · ${startTime}–${endTime} · ${hours} ชม.`;
}
