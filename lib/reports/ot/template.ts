import type { OtReportModel } from "./model";
import type { OtReportSortRule, OtReportVariant } from "./options";

export type OtReportDocument = {
  variant: OtReportVariant;
  model: OtReportModel;
  sortRules: readonly OtReportSortRule[];
};
