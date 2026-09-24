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
    dotClass: "bg-status-violet",
    surfaceClass: "bg-status-violet/10",
    textClass: "text-status-violet",
    barClass: "bg-status-violet",
  },
];

export const LEAVE_TYPE_CODES = new Set(LEAVE_TYPE_PRESENTATION.map((type) => type.code));

export function getLeaveTypePresentation(code) {
  return LEAVE_TYPE_PRESENTATION.find((type) => type.code === code) || null;
}
