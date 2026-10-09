import type { LeaveReportSortRule } from "./options";

export type LeaveReportEmployee = {
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

export type LeaveReportType = { code: string; name: string; isActive: boolean };
export type LeaveReportRequestRow = {
  id: string;
  employeeId: string;
  leaveTypeCode: string;
  startOn: string;
  endOn: string;
  session: string;
  reason: string | null;
};
export type LeaveReportTotals = { daysHalfUnits: number; byType: Record<string, number>; requestCount: number };
export type LeaveReportRequest = LeaveReportRequestRow & {
  clippedStartOn: string;
  clippedEndOn: string;
  daysHalfUnits: number;
  month: number | null;
};
export type LeaveReportMonth = {
  month: number;
  label: string;
  totals: LeaveReportTotals;
  requests: LeaveReportRequest[];
};
export type LeaveReportEmployeeModel = {
  employee: LeaveReportEmployee;
  name: string;
  totals: LeaveReportTotals;
  months: LeaveReportMonth[];
  requests: LeaveReportRequest[];
};
export type LeaveReportModel = {
  year: number;
  month: number | null;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  generatedAt: string;
  types: LeaveReportType[];
  employees: LeaveReportEmployeeModel[];
  totals: LeaveReportTotals;
  detailCount: number;
};

export const LEAVE_THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
] as const;

export function emptyLeaveReportTotals(types: readonly LeaveReportType[] = []): LeaveReportTotals {
  return { daysHalfUnits: 0, byType: Object.fromEntries(types.map((type) => [type.code, 0])), requestCount: 0 };
}

function dateOrdinal(value: string) {
  return Date.parse(`${value}T00:00:00.000Z`) / 86_400_000;
}

function dateString(ordinal: number) {
  return new Date(ordinal * 86_400_000).toISOString().slice(0, 10);
}

function daysToHalfUnits(startOn: string, endOn: string, session: string, originalStartOn = startOn, originalEndOn = endOn) {
  if (originalStartOn === originalEndOn && session !== "full") return 1;
  // Matches app/api/leave/_shared.ts:leaveDaySpan inclusive calendar-day
  // behavior, but remains pure so fixtures never initialize a DB client.
  return Math.max(0, dateOrdinal(endOn) - dateOrdinal(startOn) + 1) * 2;
}

function addRequest(totals: LeaveReportTotals, request: LeaveReportRequest) {
  totals.daysHalfUnits += request.daysHalfUnits;
  totals.byType[request.leaveTypeCode] = (totals.byType[request.leaveTypeCode] ?? 0) + request.daysHalfUnits;
  totals.requestCount += 1;
}

function normalizeTypes(types: LeaveReportType[], requests: LeaveReportRequestRow[]) {
  const usedCodes = new Set(requests.map((request) => request.leaveTypeCode));
  const byCode = new Map(types.map((type) => [type.code, type]));
  for (const code of usedCodes) if (!byCode.has(code)) byCode.set(code, { code, name: code, isActive: false });
  const priority = ["sick", "personal", "birthday"];
  return [...byCode.values()]
    .filter((type) => type.isActive || usedCodes.has(type.code))
    .sort((a, b) => {
      const pa = priority.indexOf(a.code);
      const pb = priority.indexOf(b.code);
      if (pa >= 0 || pb >= 0) return (pa < 0 ? 3 : pa) - (pb < 0 ? 3 : pb);
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name, "th", { sensitivity: "base" }) || a.code.localeCompare(b.code);
    });
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").localeCompare(b ?? "", "th", { sensitivity: "base", numeric: true });
}

export function aggregateLeaveReport(input: {
  year: number;
  month?: number;
  periodStart: string;
  periodEnd: string;
  generatedAt?: Date;
  employees: LeaveReportEmployee[];
  leaveTypes: LeaveReportType[];
  requests: LeaveReportRequestRow[];
}) {
  const types = normalizeTypes(input.leaveTypes, input.requests);
  const months = input.month === undefined ? Array.from({ length: 12 }, (_, index) => index + 1) : [input.month];
  const periodStartOrdinal = dateOrdinal(input.periodStart);
  const periodEndOrdinal = dateOrdinal(input.periodEnd);
  const monthByEmployee = new Map<string, Map<number, LeaveReportMonth>>();
  const employeesById = new Map<string, LeaveReportEmployeeModel>();

  for (const employee of input.employees) {
    const employeeMonths = new Map<number, LeaveReportMonth>();
    for (const month of months) {
      employeeMonths.set(month, {
        month,
        label: LEAVE_THAI_MONTHS[month - 1],
        totals: emptyLeaveReportTotals(types),
        requests: [],
      });
    }
    employeesById.set(employee.id, {
      employee,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      totals: emptyLeaveReportTotals(types),
      months: [...employeeMonths.values()],
      requests: [],
    });
    monthByEmployee.set(employee.id, employeeMonths);
  }

  const sortedRows = [...input.requests].sort((a, b) => a.startOn.localeCompare(b.startOn) || a.id.localeCompare(b.id));
  for (const row of sortedRows) {
    const employee = employeesById.get(row.employeeId);
    if (!employee) continue;
    const requestStart = dateOrdinal(row.startOn);
    const requestEnd = dateOrdinal(row.endOn);
    const clippedStartOrdinal = Math.max(requestStart, periodStartOrdinal);
    const clippedEndOrdinal = Math.min(requestEnd, periodEndOrdinal);
    if (clippedStartOrdinal > clippedEndOrdinal) continue;
    const clippedStartOn = dateString(clippedStartOrdinal);
    const clippedEndOn = dateString(clippedEndOrdinal);
    const periodHalfUnits = daysToHalfUnits(clippedStartOn, clippedEndOn, row.session, row.startOn, row.endOn);
    const request: LeaveReportRequest = {
      ...row,
      reason: row.reason ?? "",
      clippedStartOn,
      clippedEndOn,
      daysHalfUnits: periodHalfUnits,
      month: null,
    };
    employee.requests.push(request);
    addRequest(employee.totals, request);

    for (const month of months) {
      const monthStart = dateOrdinal(`${input.year}-${String(month).padStart(2, "0")}-01`);
      const monthEnd = dateOrdinal(dateString(Date.UTC(input.year, month, 0) / 86_400_000));
      const segmentStart = Math.max(clippedStartOrdinal, monthStart);
      const segmentEnd = Math.min(clippedEndOrdinal, monthEnd);
      if (segmentStart > segmentEnd) continue;
      const monthRequest: LeaveReportRequest = {
        ...request,
        clippedStartOn: dateString(segmentStart),
        clippedEndOn: dateString(segmentEnd),
        daysHalfUnits: daysToHalfUnits(dateString(segmentStart), dateString(segmentEnd), row.session, row.startOn, row.endOn),
        month,
      };
      const reportMonth = monthByEmployee.get(row.employeeId)?.get(month);
      if (!reportMonth) continue;
      reportMonth.requests.push(monthRequest);
      addRequest(reportMonth.totals, monthRequest);
    }
  }

  for (const entry of employeesById.values()) {
    entry.requests.sort((a, b) => a.startOn.localeCompare(b.startOn) || a.id.localeCompare(b.id));
    entry.months.sort((a, b) => a.month - b.month);
    for (const month of entry.months) month.requests.sort((a, b) => a.startOn.localeCompare(b.startOn) || a.id.localeCompare(b.id));
  }
  const employees = [...employeesById.values()];
  const totals = emptyLeaveReportTotals(types);
  for (const employee of employees) {
    totals.daysHalfUnits += employee.totals.daysHalfUnits;
    totals.requestCount += employee.totals.requestCount;
    for (const type of types) totals.byType[type.code] += employee.totals.byType[type.code] ?? 0;
  }
  return {
    year: input.year,
    month: input.month ?? null,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    periodLabel: input.month === undefined ? `ปี ${input.year}` : `${LEAVE_THAI_MONTHS[input.month - 1]} ${input.year}`,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    types,
    employees,
    totals,
    detailCount: totals.requestCount,
  };
}

export function sortLeaveReportEmployees(employees: LeaveReportEmployeeModel[], rules: readonly LeaveReportSortRule[]) {
  return [...employees].sort((a, b) => {
    for (const rule of rules) {
      let comparison = 0;
      if (rule.field === "position") comparison = compareText(a.employee.positionName, b.employee.positionName);
      else if (rule.field === "days") comparison = a.totals.daysHalfUnits - b.totals.daysHalfUnits;
      else if (rule.field === "name") comparison = compareText(a.name, b.name);
      else if (rule.field === "department") comparison = compareText(a.employee.departmentName, b.employee.departmentName);
      if (comparison) return rule.direction === "desc" ? -comparison : comparison;
    }
    return compareText(a.employee.code, b.employee.code) || a.employee.id.localeCompare(b.employee.id);
  });
}

export function formatLeaveDays(halfUnits: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(halfUnits / 2);
}
