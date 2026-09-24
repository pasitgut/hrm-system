// Shared, unit-tested Leave helpers used by every component under
// components/hrm/leave/**: the 4-tab status filter defs and status -> Chip
// color mapping. Deliberately not imported from components/hrm/ot/** (kept
// independent even though the shape mirrors OT_STATUS_TABS) to avoid any
// coupling with the OT module's in-flight edits.

export const LEAVE_STATUS_TABS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "pending", label: "รอจัดการ" },
  { key: "approved", label: "อนุมัติแล้ว" },
  { key: "rejected", label: "ไม่อนุมัติ" },
];

const STATUS_COLORS = { pending: "yellow", approved: "lime", rejected: "rose", cancelled: "gray" };

export function statusColor(statusCode) {
  return STATUS_COLORS[statusCode] || "gray";
}

// 3 / 0.5 -> "3 วัน" / "0.5 วัน" — Thai day-count label used across the
// list, quota cards, and dialogs.
export function formatDays(days) {
  if (typeof days !== "number" || !Number.isFinite(days)) return "-";
  return `${days} วัน`;
}

// "2026-10-05" -> "5 ต.ค. 2569" (Buddhist year, short Thai month).
const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export function formatThaiDate(dateStr) {
  if (typeof dateStr !== "string") return "-";
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  return `${day} ${THAI_MONTHS_SHORT[month - 1]} ${year + 543}`;
}

// "2026-10-05" + "2026-10-05" -> "5 ต.ค. 2569"
// "2026-10-05" + "2026-10-07" -> "5 – 7 ต.ค. 2569"
export function formatDateRange(startOn, endOn) {
  if (startOn === endOn) return formatThaiDate(startOn);
  return `${formatThaiDate(startOn)} – ${formatThaiDate(endOn)}`;
}
