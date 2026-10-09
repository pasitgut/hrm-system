import type { OtReportSortRule } from "./options";

export type OtReportEmployee = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  departmentId: number | null;
  departmentName: string;
  positionId: number | null;
  positionName: string;
  startDate: string;
  endDate: string | null;
};

export type OtReportRequestRow = {
  id: string;
  employeeId: string;
  startAt: Date;
  endAt: Date;
  overtimeType: string | null;
  reason: string;
};

export type OtReportTotals = {
  weekdayMs: number;
  holidayMs: number;
  unknownMs: number;
  totalMs: number;
  requestCount: number;
};

export type OtReportRequest = {
  id: string;
  employeeId: string;
  startAt: string;
  endAt: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  month: number;
  overtimeType: "weekday" | "holiday" | "unknown";
  durationMs: number;
  reason: string;
};

export type OtReportMonth = {
  month: number;
  label: string;
  totals: OtReportTotals;
  requests: OtReportRequest[];
};

export type OtReportEmployeeModel = {
  employee: OtReportEmployee;
  name: string;
  totals: OtReportTotals;
  months: OtReportMonth[];
};

export type OtReportModel = {
  year: number;
  month: number | null;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  generatedAt: string;
  employees: OtReportEmployeeModel[];
  totals: OtReportTotals;
  hasUnknownType: boolean;
  detailCount: number;
};

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
] as const;

const emptyTotals = (): OtReportTotals => ({ weekdayMs: 0, holidayMs: 0, unknownMs: 0, totalMs: 0, requestCount: 0 });

export function bangkokParts(date: Date) {
  const local = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
  };
}

export function formatBangkokDate(date: Date) {
  const part = bangkokParts(date);
  return `${part.day} ${THAI_MONTHS[part.month - 1]} ${part.year}`;
}

function localDateAndTime(date: Date) {
  const part = bangkokParts(date);
  return {
    date: `${part.year}-${String(part.month).padStart(2, "0")}-${String(part.day).padStart(2, "0")}`,
    time: `${String(part.hour).padStart(2, "0")}:${String(part.minute).padStart(2, "0")}`,
    year: part.year,
    month: part.month,
  };
}

function addTotals(target: OtReportTotals, request: OtReportRequest) {
  target.totalMs += request.durationMs;
  target.requestCount += 1;
  if (request.overtimeType === "weekday") target.weekdayMs += request.durationMs;
  else if (request.overtimeType === "holiday") target.holidayMs += request.durationMs;
  else target.unknownMs += request.durationMs;
}

function sortRequests(requests: OtReportRequest[]) {
  return requests.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
}

export function aggregateOtReport(input: {
  year: number;
  month?: number;
  periodStart: string;
  periodEnd: string;
  generatedAt?: Date;
  employees: OtReportEmployee[];
  requests: OtReportRequestRow[];
}): OtReportModel {
  const monthNumbers = input.month === undefined ? Array.from({ length: 12 }, (_, index) => index + 1) : [input.month];
  const monthlyByEmployee = new Map<string, Map<number, OtReportMonth>>();
  const models = new Map<string, OtReportEmployeeModel>();

  for (const employee of input.employees) {
    const months = new Map<number, OtReportMonth>();
    for (const month of monthNumbers) months.set(month, {
      month,
      label: THAI_MONTHS[month - 1],
      totals: emptyTotals(),
      requests: [],
    });
    const name = `${employee.firstName} ${employee.lastName}`.trim();
    models.set(employee.id, { employee, name, totals: emptyTotals(), months: Array.from(months.values()) });
    monthlyByEmployee.set(employee.id, months);
  }

  for (const row of input.requests) {
    const start = localDateAndTime(row.startAt);
    if (start.year !== input.year || (input.month !== undefined && start.month !== input.month)) continue;
    const month = monthlyByEmployee.get(row.employeeId)?.get(start.month);
    const employee = models.get(row.employeeId);
    if (!month || !employee) continue;
    const end = localDateAndTime(row.endAt);
    const request: OtReportRequest = {
      id: row.id,
      employeeId: row.employeeId,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      startDate: start.date,
      endDate: end.date,
      startTime: start.time,
      endTime: end.time,
      month: start.month,
      overtimeType: row.overtimeType === "weekday" || row.overtimeType === "holiday" ? row.overtimeType : "unknown",
      durationMs: Math.max(0, row.endAt.getTime() - row.startAt.getTime()),
      reason: row.reason,
    };
    month.requests.push(request);
    addTotals(month.totals, request);
    addTotals(employee.totals, request);
  }

  const employees = Array.from(models.values());
  for (const employee of employees) {
    employee.months = employee.months.map((month) => ({ ...month, requests: sortRequests(month.requests) }));
  }
  const totals = emptyTotals();
  for (const employee of employees) {
    totals.weekdayMs += employee.totals.weekdayMs;
    totals.holidayMs += employee.totals.holidayMs;
    totals.unknownMs += employee.totals.unknownMs;
    totals.totalMs += employee.totals.totalMs;
    totals.requestCount += employee.totals.requestCount;
  }
  const periodLabel = input.month === undefined
    ? `ปี ${input.year}`
    : `${THAI_MONTHS[input.month - 1]} ${input.year}`;
  return {
    year: input.year,
    month: input.month ?? null,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    periodLabel,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    employees,
    totals,
    hasUnknownType: totals.unknownMs > 0,
    detailCount: totals.requestCount,
  };
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").localeCompare(b ?? "", "th", { sensitivity: "base", numeric: true });
}

export function sortOtReportEmployees(
  employees: OtReportEmployeeModel[],
  rules: readonly OtReportSortRule[],
): OtReportEmployeeModel[] {
  return [...employees].sort((a, b) => {
    for (const rule of rules) {
      let comparison = 0;
      if (rule.field === "position") comparison = compareText(a.employee.positionName, b.employee.positionName);
      else if (rule.field === "hours") comparison = a.totals.totalMs - b.totals.totalMs;
      else if (rule.field === "name") comparison = compareText(a.name, b.name);
      else if (rule.field === "department") comparison = compareText(a.employee.departmentName, b.employee.departmentName);
      if (comparison !== 0) return rule.direction === "desc" ? -comparison : comparison;
    }
    return compareText(a.employee.code, b.employee.code) || a.employee.id.localeCompare(b.employee.id);
  });
}

export function formatOtHours(durationMs: number): string {
  const value = Math.max(0, durationMs) / 3_600_000;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value);
}
