export const LEAVE_TYPE_PRESENTATION = [
  {
    code: "personal",
    name: "ลากิจ",
    dotClass: "bg-status-warning",
    surfaceClass: "bg-status-warning/10",
    textClass: "text-status-warning",
    barClass: "bg-status-warning",
  },
  {
    code: "sick",
    name: "ลาป่วย",
    dotClass: "bg-status-danger",
    surfaceClass: "bg-status-danger/10",
    textClass: "text-status-danger",
    barClass: "bg-status-danger",
  },
  {
    code: "birthday",
    name: "ลาวันเกิด",
    dotClass: "bg-status-neutral",
    surfaceClass: "bg-status-neutral/10",
    textClass: "text-status-neutral",
    barClass: "bg-status-neutral",
  },
  {
    code: "vacation",
    name: "ลาพักร้อน",
    dotClass: "bg-status-info",
    surfaceClass: "bg-status-info/10",
    textClass: "text-status-info",
    barClass: "bg-status-info",
  },
];

export const LEAVE_TYPE_CODES = new Set(LEAVE_TYPE_PRESENTATION.map((type) => type.code));

// Leave types created in Settings have no fixed colour; cycle through these.
const CUSTOM_LEAVE_TYPE_STYLES = [
  { dotClass: "bg-status-success", surfaceClass: "bg-status-success/10", textClass: "text-status-success", barClass: "bg-status-success" },
  { dotClass: "bg-work-status-progress", surfaceClass: "bg-work-status-progress/10", textClass: "text-work-status-progress", barClass: "bg-work-status-progress" },
  { dotClass: "bg-primary", surfaceClass: "bg-primary/10", textClass: "text-primary", barClass: "bg-primary" },
];

// Built-in types first (fixed order), then every other type — sorted by name — with a cycled colour.
// `types` are `{ code, name }` objects (leave types, quota rows or leave requests mapped to that shape).
export function withCustomLeaveTypes(types = []) {
  const extras = new Map();
  for (const type of types) {
    if (type?.code && !LEAVE_TYPE_CODES.has(type.code) && !extras.has(type.code)) extras.set(type.code, type.name || type.code);
  }
  const custom = [...extras.entries()]
    .sort((left, right) => left[1].localeCompare(right[1], "th"))
    .map(([code, name], index) => ({ code, name, ...CUSTOM_LEAVE_TYPE_STYLES[index % CUSTOM_LEAVE_TYPE_STYLES.length] }));
  return [...LEAVE_TYPE_PRESENTATION, ...custom];
}

export function getLeaveTypePresentation(code) {
  return LEAVE_TYPE_PRESENTATION.find((type) => type.code === code) || null;
}
