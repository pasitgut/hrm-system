import { getOtReportDefinition, type OtReportSortRule, type OtReportVariant } from "./options";
import type { OtReportEmployee, OtReportModel, OtReportRequest, OtReportTotals } from "./model";
import type { OtReportDocument } from "./template";

export type OtReportPdfRequest = Pick<OtReportRequest,
  "startDate" | "endDate" | "startTime" | "endTime" | "month" | "overtimeType" | "durationMs" | "reason"
>;

export type OtReportPdfMonth = {
  month: number;
  label: string;
  totals: OtReportTotals;
  requests: OtReportPdfRequest[];
};

export type OtReportPdfEmployee = {
  employee: Pick<OtReportEmployee, "id" | "code" | "departmentName" | "positionName">;
  name: string;
  totals: OtReportTotals;
  months: OtReportPdfMonth[];
};

export type OtReportPdfModel = Pick<OtReportModel,
  "year" | "month" | "periodStart" | "periodEnd" | "generatedAt" | "hasUnknownType"
> & {
  employees: OtReportPdfEmployee[];
};

export type OtReportPdfDocument = {
  variant: OtReportVariant;
  model: OtReportPdfModel;
  sortRules: readonly OtReportSortRule[];
};

export function createOtReportPdfPayload(report: OtReportDocument): OtReportPdfDocument {
  const detail = getOtReportDefinition(report.variant)!.detail;
  return {
    variant: report.variant,
    sortRules: report.sortRules,
    model: {
      year: report.model.year,
      month: report.model.month,
      periodStart: report.model.periodStart,
      periodEnd: report.model.periodEnd,
      generatedAt: report.model.generatedAt,
      hasUnknownType: report.model.hasUnknownType,
      employees: report.model.employees.map((employee) => ({
        employee: {
          id: employee.employee.id,
          code: employee.employee.code,
          departmentName: employee.employee.departmentName,
          positionName: employee.employee.positionName,
        },
        name: employee.name,
        totals: employee.totals,
        months: employee.months.map((month) => ({
          month: month.month,
          label: month.label,
          totals: month.totals,
          requests: detail
            ? month.requests.map(({ startDate, endDate, startTime, endTime, month: requestMonth, overtimeType, durationMs, reason }) => ({
              startDate,
              endDate,
              startTime,
              endTime,
              month: requestMonth,
              overtimeType,
              durationMs,
              reason,
            }))
            : [],
        })),
      })),
    },
  };
}
