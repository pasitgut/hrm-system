// Shared, unit-tested OT helpers used by every component under
// components/hrm/ot/**: duration math, Thai formatting, the 4-tab status
// filter defs, and status -> Chip color mapping.

// Mirrors the live duration calc that used to live inline in the old
// OTModule.jsx (kept verbatim, just wrapped + made testable).
export function computeDurationHours(startTime, endTime) {
  if (typeof startTime !== "string" || typeof endTime !== "string") return null;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some((value) => !Number.isFinite(value))) return null;
  const minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

// "2 ชม. 30 นาที" / "3 ชั่วโมง" / "30 นาที" — matches the Thai phrasing
// style of the original OTModule.jsx.
export function formatDuration(hours) {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) return "ตรวจสอบเวลา";
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (wholeHours === 0) return `${minutes} นาที`;
  if (minutes === 0) return `${wholeHours} ชั่วโมง`;
  return `${wholeHours} ชม. ${minutes} นาที`;
}

export const OT_STATUS_TABS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "pending", label: "รอจัดการ" },
  { key: "approved", label: "อนุมัติแล้ว" },
  { key: "rejected", label: "ไม่อนุมัติ" },
];

const STATUS_COLORS = { pending: "yellow", approved: "lime", rejected: "rose" };

export function statusColor(statusCode) {
  return STATUS_COLORS[statusCode] || "gray";
}

// Client-side "what month is it in Asia/Bangkok" — used to default the
// calendar/list/summary views' month state. Asia/Bangkok has no DST so this
// is safe via Intl without extra libraries.
export function currentMonthInBangkok(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(referenceDate);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// "2026-09" -> "กันยายน 2569" (Buddhist year).
export function formatMonthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${THAI_MONTHS[monthNumber - 1]} ${year + 543}`;
}

// "2026-09" + -1 -> "2026-08", "2026-01" + -1 -> "2025-12".
export function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split("-").map(Number);
  const total = year * 12 + (monthNumber - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}
