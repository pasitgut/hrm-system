const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const AVATAR_COLORS = ["blue", "orange", "lime", "purple", "pink", "cyan", "green", "rose"];

export const THAI_MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  shortLabel: THAI_MONTHS_SHORT[index],
  label: new Intl.DateTimeFormat("th-TH", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, index, 1)),
  ),
}));

export function getShortMonthLabel(month) {
  return THAI_MONTHS_SHORT[Number(month) - 1] ?? String(month);
}

export function getFullMonthLabel(month) {
  return THAI_MONTH_OPTIONS[Number(month) - 1]?.label ?? String(month);
}

export function toBuddhistYear(year) {
  return Number(year) + 543;
}

export function formatThaiDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "—";
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  const [, yyyy, mm, dd] = match;
  return `${dd}/${mm}/${Number(yyyy) + 543}`;
}

export function formatMoney(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBaht(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${formatMoney(value)} บาท`;
}

export function formatCompactBaht(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) {
    return `฿${(value / 1_000_000).toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}M`;
  }
  return `฿${value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatHours(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

export function getEmployeeInitials(name, code) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  if (parts[0]) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return String(code ?? "??").slice(0, 2).toUpperCase();
}

export function getAvatarColor(code) {
  const text = String(code ?? "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
