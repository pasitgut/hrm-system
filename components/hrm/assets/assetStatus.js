// Shared, small helpers used by every component under components/hrm/assets/**:
// Thai labels/Chip colors for both the asset's own lifecycle status
// (assets.status) and a loan's approval status (assetLoans.statusCode, via
// requestStatuses) — these are two different state machines, kept as
// separate lookup tables here so they're never confused.

export const ASSET_STATUS_LABELS = {
  available: "พร้อมให้ยืม",
  in_use: "กำลังใช้งาน",
  maintenance: "ซ่อมบำรุง",
  retired: "เลิกใช้งาน",
};

export function assetStatusLabel(status) {
  return ASSET_STATUS_LABELS[status] || status;
}

const ASSET_STATUS_COLORS = { available: "cyan", in_use: "lime", maintenance: "yellow", retired: "gray" };

export function assetStatusColor(status) {
  return ASSET_STATUS_COLORS[status] || "gray";
}

export const ASSET_STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS);

// Loan (assetLoans.statusCode) — reuses the shared request_statuses table,
// same 4-tab shape as OT's status filter.
export const LOAN_STATUS_TABS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "pending", label: "รอจัดการ" },
  { key: "approved", label: "อนุมัติแล้ว" },
  { key: "rejected", label: "ไม่อนุมัติ" },
];

const LOAN_STATUS_COLORS = { pending: "yellow", approved: "lime", rejected: "rose", cancelled: "gray" };

export function loanStatusColor(statusCode) {
  return LOAN_STATUS_COLORS[statusCode] || "gray";
}
