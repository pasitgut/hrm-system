import { describe, expect, it } from "vitest";
import { aggregateOtReport, type OtReportEmployee, type OtReportRequestRow } from "./model";
import { createOtReportMarkup } from "./template";
import type { OtReportVariant } from "./options";

const employees: OtReportEmployee[] = [
  { id: "a", code: "0001", firstName: "กานต์", lastName: "ใจดี", departmentId: 1, departmentName: "บัญชี", positionId: 1, positionName: "เจ้าหน้าที่", startDate: "2024-01-01", endDate: null },
  { id: "b", code: "0002", firstName: "นที", lastName: "แสนดี", departmentId: 2, departmentName: "คลัง", positionId: 2, positionName: "หัวหน้า", startDate: "2024-01-01", endDate: null },
];

function buildModel(requests: OtReportRequestRow[], staff = employees) {
  return aggregateOtReport({
    year: 2026,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    generatedAt: new Date("2026-10-09T04:00:00.000Z"),
    employees: staff,
    requests,
  });
}

function markup(variant: OtReportVariant, requests: OtReportRequestRow[], staff = employees) {
  const model = buildModel(requests, staff);
  return createOtReportMarkup({ variant, model, sortRules: [] }, "cmVndWxhcg==", "Ym9sZA==").html;
}

const requests: OtReportRequestRow[] = [
  { id: "a-jan", employeeId: "a", startAt: new Date("2026-01-01T02:00:00Z"), endAt: new Date("2026-01-01T03:15:00Z"), overtimeType: "weekday", reason: "ปิดบัญชีประจำเดือน" },
  { id: "b-jan", employeeId: "b", startAt: new Date("2026-01-02T02:00:00Z"), endAt: new Date("2026-01-02T04:00:00Z"), overtimeType: "holiday", reason: "ตรวจนับสินค้าคงคลัง" },
  { id: "b-feb", employeeId: "b", startAt: new Date("2026-02-03T02:00:00Z"), endAt: new Date("2026-02-03T02:30:00Z"), overtimeType: null, reason: "ข้อมูลประเภทเดิม" },
];

describe("OT report print templates", () => {
  it("orders continuous month rows by month then employee", () => {
    const html = markup("yearly-all-month-columns", requests);
    const tbody = html.match(/<table class="month-columns-table">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const rows = [...tbody.matchAll(/<tr><td>(.*?)<\/td>\s*<td class="code">(.*?)<\/td>/g)].map((match) => `${match[1]}:${match[2]}`);
    expect(rows.slice(0, 4)).toEqual([
      "มกราคม 2026:0001",
      "มกราคม 2026:0002",
      "กุมภาพันธ์ 2026:0001",
      "กุมภาพันธ์ 2026:0002",
    ]);
  });

  it("shows the combined monthly total and includes all twelve months when no employees overlap", () => {
    const html = markup("yearly-all-month-pages", requests);
    const january = html.match(/<section class="month-report[^\"]*">([\s\S]*?)<\/section>/)?.[1] ?? "";
    expect(january).toContain("รวมเดือนมกราคม");
    expect(january).toContain("รวมทั้งหมด <b>3.25</b> ชม.");

    const emptyHtml = markup("yearly-all-month-pages", [], []);
    expect(emptyHtml.match(/<section class="month-report/g)).toHaveLength(12);
    expect(emptyHtml).toContain("ไม่มีพนักงานในช่วงเวลานี้");
  });

  it("escapes long Thai reasons, flags unknown types, and lets detail rows flow across pages", () => {
    const longReason = `<script>alert("x")</script> ${"ตรวจรายการสินค้าและจัดทำเอกสารประกอบการส่งมอบ ".repeat(25)}`;
    const detailed = [{
      id: "long", employeeId: "a", startAt: new Date("2026-06-02T12:00:00Z"), endAt: new Date("2026-06-02T13:00:00Z"), overtimeType: "legacy", reason: longReason,
    } satisfies OtReportRequestRow];
    const html = markup("yearly-individual-detail", detailed, [employees[0]]);
    expect(html).toContain("มีรายการ ไม่ระบุประเภท 1.0 ชั่วโมง ซึ่งรวมในยอดรวมแล้ว");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(");
    expect(html).toContain("ตรวจรายการสินค้าและจัดทำเอกสารประกอบการส่งมอบ");
    expect(html).toContain(".detail-row{page-break-inside:auto;break-inside:auto}");
  });

  it("repeats employee identity in detail table headers and uses readable table text", () => {
    const html = markup("yearly-individual-detail", requests, [employees[0]]);
    expect(html).toContain(`<tr class="repeat-employee"><th colspan="5">0001 · ${employees[0].firstName} ${employees[0].lastName}</th></tr>`);
    expect(html).toContain('<colgroup><col style="width:17%"><col style="width:18%"><col style="width:13%"><col style="width:12%"><col style="width:40%"></colgroup>');
    expect(html).toContain("th{background:#34434c;color:#fff;font-size:10px");
    expect(html).toContain("td{font-size:10px}");

    const monthColumns = markup("yearly-individual-month-columns-detail", requests, [employees[0]]);
    expect(monthColumns).toContain('<colgroup><col style="width:12%"><col style="width:16%"><col style="width:17%"><col style="width:13%"><col style="width:12%"><col style="width:30%"></colgroup>');
  });
});
