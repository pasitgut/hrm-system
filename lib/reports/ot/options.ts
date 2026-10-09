import { z } from "zod";

export const OT_REPORT_VARIANTS = [
  { id: "monthly-all", label: "รายเดือน · พนักงานทั้งหมด แยกแผนก", period: "monthly", scope: "all", detail: false, display: "summary" },
  { id: "monthly-individual", label: "รายเดือน · แยกตามพนักงาน", period: "monthly", scope: "individual", detail: false, display: "summary" },
  { id: "monthly-individual-detail", label: "รายเดือน · รายละเอียดรายวัน แยกตามพนักงาน", period: "monthly", scope: "individual", detail: true, display: "daily" },
  { id: "yearly-all", label: "รายปี · พนักงานทั้งหมด แยกแผนก", period: "yearly", scope: "all", detail: false, display: "summary" },
  { id: "yearly-all-month-columns", label: "รายปี · ตารางต่อเนื่อง มีคอลัมน์เดือน", period: "yearly", scope: "all", detail: false, display: "month-columns" },
  { id: "yearly-all-month-pages", label: "รายปี · แยกหน้ารายเดือนและสรุปปี", period: "yearly", scope: "all", detail: false, display: "month-pages" },
  { id: "yearly-individual", label: "รายปี · แยกตามพนักงาน", period: "yearly", scope: "individual", detail: false, display: "summary" },
  { id: "yearly-individual-month-columns", label: "รายปี · แยกพนักงาน ตารางคอลัมน์เดือน", period: "yearly", scope: "individual", detail: false, display: "month-columns" },
  { id: "yearly-individual-month-pages", label: "รายปี · แยกพนักงาน หน้ารายเดือนและสรุปปี", period: "yearly", scope: "individual", detail: false, display: "month-pages" },
  { id: "yearly-individual-detail", label: "รายปี · แยกพนักงาน รายละเอียดต่อเนื่อง", period: "yearly", scope: "individual", detail: true, display: "daily" },
  { id: "yearly-individual-month-columns-detail", label: "รายปี · แยกพนักงาน รายละเอียดคอลัมน์เดือน", period: "yearly", scope: "individual", detail: true, display: "month-columns" },
  { id: "yearly-individual-month-pages-detail", label: "รายปี · แยกพนักงาน รายละเอียดแยกเดือน", period: "yearly", scope: "individual", detail: true, display: "month-pages" },
] as const;

export type OtReportVariant = (typeof OT_REPORT_VARIANTS)[number]["id"];
export type OtReportSortField = "position" | "hours" | "name" | "department";
export type OtReportSortRule = { field: OtReportSortField; direction: "asc" | "desc" };
export type OtReportDefinition = (typeof OT_REPORT_VARIANTS)[number];

export function getOtReportDefinition(id: string): OtReportDefinition | undefined {
  return OT_REPORT_VARIANTS.find((item) => item.id === id);
}

const sortRuleSchema = z.object({
  field: z.enum(["position", "hours", "name", "department"]),
  direction: z.enum(["asc", "desc"]),
}).strict();

export const otReportExportSchema = z.object({
  variant: z.enum(OT_REPORT_VARIANTS.map((item) => item.id) as [OtReportVariant, ...OtReportVariant[]]),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).optional(),
  employeeIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  sortRules: z.array(sortRuleSchema).max(4).default([]),
}).strict().superRefine((input, context) => {
  const definition = getOtReportDefinition(input.variant);
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

export type OtReportExportInput = z.infer<typeof otReportExportSchema>;

export function getOtReportPeriod(year: number, month?: number) {
  const firstMonth = month ?? 1;
  const startAt = new Date(Date.UTC(year, firstMonth - 1, 1, -7));
  const endAt = month === undefined
    ? new Date(Date.UTC(year + 1, 0, 1, -7))
    : new Date(Date.UTC(year, firstMonth, 1, -7));
  const startLocalDate = `${year}-${String(firstMonth).padStart(2, "0")}-01`;
  const endLocalDate = month === undefined
    ? `${year}-12-31`
    : `${year}-${String(firstMonth).padStart(2, "0")}-${new Date(Date.UTC(year, firstMonth, 0)).getUTCDate()}`;
  return { startAt, endAt, startLocalDate, endLocalDate };
}

export const OT_REPORT_LABELS = {
  company: "บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด",
  weekdays: "วันทำงาน",
  holidays: "วันหยุด",
  unknown: "ไม่ระบุประเภท",
  total: "รวมทั้งหมด",
} as const;
