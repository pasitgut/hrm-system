import { z } from "zod";
import { OT_REPORT_VARIANTS } from "@/lib/reports/ot/options";

export const LEAVE_REPORT_VARIANTS = OT_REPORT_VARIANTS;
export type LeaveReportVariant = (typeof LEAVE_REPORT_VARIANTS)[number]["id"];
export type LeaveReportSortField = "position" | "days" | "name" | "department";
export type LeaveReportSortRule = { field: LeaveReportSortField; direction: "asc" | "desc" };
export type LeaveReportDefinition = (typeof LEAVE_REPORT_VARIANTS)[number];

export function getLeaveReportDefinition(id: string): LeaveReportDefinition | undefined {
  return LEAVE_REPORT_VARIANTS.find((item) => item.id === id);
}

const sortRuleSchema = z.object({
  field: z.enum(["position", "days", "name", "department"]),
  direction: z.enum(["asc", "desc"]),
}).strict();

export const leaveReportExportSchema = z.object({
  variant: z.enum(LEAVE_REPORT_VARIANTS.map((item) => item.id) as [LeaveReportVariant, ...LeaveReportVariant[]]),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).optional(),
  employeeIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  sortRules: z.array(sortRuleSchema).max(4).default([]),
}).strict().superRefine((input, context) => {
  const definition = getLeaveReportDefinition(input.variant);
  if (!definition) return;
  if (definition.period === "monthly" && input.month === undefined) {
    context.addIssue({ code: "custom", path: ["month"], message: "กรุณาระบุเดือน" });
  }
  if (definition.period === "yearly" && input.month !== undefined) {
    context.addIssue({ code: "custom", path: ["month"], message: "รายงานรายปีไม่รับค่าเดือน" });
  }
  if (definition.scope === "individual" && input.employeeIds === undefined) {
    context.addIssue({ code: "custom", path: ["employeeIds"], message: "กรุณาเลือกพนักงานอย่างน้อยหนึ่งคน" });
  }
  if (definition.scope === "all" && input.employeeIds !== undefined) {
    context.addIssue({ code: "custom", path: ["employeeIds"], message: "รายงานพนักงานทั้งหมดไม่รับรายชื่อพนักงาน" });
  }
  if (input.employeeIds && new Set(input.employeeIds).size !== input.employeeIds.length) {
    context.addIssue({ code: "custom", path: ["employeeIds"], message: "รายชื่อพนักงานซ้ำกันไม่ได้" });
  }
  const fields = input.sortRules.map((rule) => rule.field);
  if (new Set(fields).size !== fields.length) {
    context.addIssue({ code: "custom", path: ["sortRules"], message: "เงื่อนไขเรียงลำดับซ้ำกันไม่ได้" });
  }
});

export type LeaveReportExportInput = z.infer<typeof leaveReportExportSchema>;

export function getLeaveReportPeriod(year: number, month?: number) {
  const firstMonth = month ?? 1;
  const startOn = `${year}-${String(firstMonth).padStart(2, "0")}-01`;
  const endOn = month === undefined
    ? `${year}-12-31`
    : `${year}-${String(firstMonth).padStart(2, "0")}-${new Date(Date.UTC(year, firstMonth, 0)).getUTCDate()}`;
  return { startOn, endOn };
}
