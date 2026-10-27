import type { LeaveReportModel } from "./model";
import type { LeaveReportSortRule, LeaveReportVariant } from "./options";

export type LeaveReportDocument = {
  variant: LeaveReportVariant;
  model: LeaveReportModel;
  sortRules: readonly LeaveReportSortRule[];
};
