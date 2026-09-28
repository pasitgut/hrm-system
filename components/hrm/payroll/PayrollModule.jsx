"use client";

import { useState } from "react";
import {
  RiBankLine,
  RiCalendarLine,
  RiCheckLine,
  RiDownload2Line,
  RiFileExcel2Line,
  RiFileList3Line,
  RiLockLine,
  RiMoneyDollarCircleLine,
  RiSearchEyeLine,
  RiSearchLine,
  RiTeamLine,
  RiWallet3Line,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/hrm/PageHeader";

const period = {
  label: "ก.ย. 2569",
  dateRange: "26/08/2569 – 25/09/2569 · จ่าย 30/09/2569",
};

const payrollRows = [
  { id: "P-1024", name: "วิภาวดี ศรีสุข", initials: "วศ", department: "บัญชี", color: "bg-primary/10 text-primary", salary: 38000, ot: 0, allowance: 1500, tax: 1063, social: 750, deduction: 1900 },
  { id: "P-1088", name: "ธนากร มั่นคง", initials: "ธม", department: "ผลิต", color: "bg-accent/10 text-status-success", salary: 18500, ot: 6240, allowance: 800, tax: 365, social: 750, deduction: 0, review: true },
  { id: "P-1102", name: "ปิยะนุช แก้วใส", initials: "ปก", department: "ไอที", color: "bg-muted text-muted-foreground", salary: 52000, ot: 0, allowance: 2000, tax: 3575, social: 750, deduction: 2600 },
  { id: "P-1125", name: "อนุชา พรหม", initials: "อพ", department: "ขาย", color: "bg-primary/10 text-primary", salary: 28000, ot: 0, allowance: 8400, tax: 908, social: 750, deduction: 3400, review: true },
  { id: "P-1174", name: "กมลวรรณ วงศ์สวัสดิ์", initials: "กว", department: "HR", color: "bg-muted text-muted-foreground", salary: 34000, ot: 0, allowance: 1500, tax: 863, social: 750, deduction: 1700 },
  { id: "P-1190", name: "ณัฐพล ทองคำ", initials: "นท", department: "ผลิต", color: "bg-accent/10 text-status-success", salary: 19000, ot: 4120, allowance: 800, tax: 284, social: 750, deduction: 500 },
  { id: "P-1218", name: "สุภาพร รุ่งเรือง", initials: "สร", department: "QA", color: "bg-primary/10 text-primary", salary: 24500, ot: 1530, allowance: 1000, tax: 439, social: 750, deduction: 1225 },
  { id: "P-1241", name: "ศุภชัย สายบุญ", initials: "ศส", department: "ผลิต", color: "bg-muted text-muted-foreground", salary: 18800, ot: 5980, allowance: 800, tax: 367, social: 750, deduction: 0 },
  { id: "P-1280", name: "พิมพ์ชนก เพชรรัตน์", initials: "พพ", department: "จัดซื้อ", color: "bg-accent/10 text-status-success", salary: 31000, ot: 0, allowance: 1500, tax: 713, social: 750, deduction: 1550 },
  { id: "P-1306", name: "วรเชษฐ์ บุญมา", initials: "วบ", department: "คลังสินค้า", color: "bg-primary/10 text-primary", salary: 17500, ot: 3210, allowance: 800, tax: 163, social: 750, deduction: 0, review: true },
  { id: "P-1342", name: "รัตนา ใจดี", initials: "รจ", department: "บริการลูกค้า", color: "bg-muted text-muted-foreground", salary: 22500, ot: 840, allowance: 1200, tax: 302, social: 750, deduction: 450, review: true },
];

const money = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const stages = [
  { label: "รวบรวมข้อมูล", detail: "เสร็จแล้ว", state: "done", icon: RiCheckLine },
  { label: "คำนวณ", detail: "เสร็จแล้ว", state: "done", icon: RiCheckLine },
  { label: "ตรวจสอบ", detail: "กำลังดำเนินการ", state: "current", icon: RiSearchEyeLine },
  { label: "อนุมัติ", detail: "รอ", state: "waiting", icon: RiLockLine },
  { label: "ล็อกงวด", detail: "รอ", state: "waiting", icon: RiLockLine },
  { label: "จ่าย & สลิป", detail: "รอ", state: "waiting", icon: RiDownload2Line },
];

const metrics = [
  { label: "พนักงานในงวด", value: "1,248", detail: "เข้าใหม่ 18 · ออก 7", icon: RiTeamLine, tone: "text-status-info" },
  { label: "รวมเงินได้ (Gross)", value: "฿43.16M", detail: "+12% จากเดือนก่อน", icon: RiWallet3Line, tone: "text-status-success" },
  { label: "ภาษี + ประกันสังคม", value: "฿2.40M", detail: "นายจ้างสมทบ ปกส. ฿0.78M", icon: RiBankLine, tone: "text-status-neutral" },
  { label: "จ่ายสุทธิ (Net)", value: "฿38.97M", detail: "กำหนดจ่าย 30/09/2569", icon: RiMoneyDollarCircleLine, tone: "text-primary" },
  { label: "รายการตรวจสอบ", value: "4", detail: "ต้องยืนยันก่อนอนุมัติ", icon: RiSearchEyeLine, tone: "text-status-warning" },
];

function amount(value) {
  return money.format(value);
}

function rowGross(row) {
  return row.salary + row.ot + row.allowance;
}

function rowNet(row) {
  return rowGross(row) - row.tax - row.social - row.deduction;
}

function downloadRegister() {
  const headers = ["รหัสพนักงาน", "พนักงาน", "แผนก", "เงินเดือน", "OT", "เงินได้อื่น", "รวมเงินได้", "ภาษี", "ประกันสังคม", "หักอื่น", "รับสุทธิ"];
  const lines = payrollRows.map((row) => [
    row.id, row.name, row.department, row.salary, row.ot, row.allowance, rowGross(row),
    row.tax, row.social, row.deduction, rowNet(row),
  ]);
  const csv = [headers, ...lines]
    .map((values) => values.map((value) => "\"" + String(value).replaceAll("\"", "\"\"") + "\"").join(","))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "payroll-register-mockup.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ProcessTimeline() {
  return (
    <ol aria-label="ขั้นตอนการจ่ายเงินเดือน" className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6 xl:gap-0">
      {stages.map((stage, index) => {
        const Icon = stage.icon;
        return (
          <li className="relative flex min-w-0 items-center gap-3 xl:px-4 first:pl-0 last:pr-0" key={stage.label}>
            {index < stages.length - 1 ? (
              <span aria-hidden="true" className={cn("absolute left-11 right-0 top-5 hidden h-px xl:block", stage.state === "done" ? "bg-status-success" : "bg-border")} />
            ) : null}
            <span className={cn(
              "relative z-10 grid size-10 shrink-0 place-items-center rounded-full",
              stage.state === "done" && "bg-status-success text-white",
              stage.state === "current" && "bg-primary text-primary-foreground ring-4 ring-primary/10",
              stage.state === "waiting" && "bg-muted text-muted-foreground",
            )}>
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0">
              <strong className={cn("block truncate text-sm font-semibold", stage.state === "waiting" && "text-muted-foreground")}>{stage.label}</strong>
              <span className="mt-0.5 block text-xs text-muted-foreground">{stage.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MetricCard({ metric }) {
  const Icon = metric.icon;
  return (
    <article className="min-w-0 py-1">
      <p className="flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
        <Icon aria-hidden="true" className={cn("size-4 shrink-0", metric.tone)} />
        {metric.label}
      </p>
      <p className="mt-1 text-lg font-semibold leading-6 tabular-nums text-foreground">{metric.value}</p>
      <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">{metric.detail}</p>
    </article>
  );
}

function PayrollTable({ rows, onlyReview, onOnlyReviewChange, search, onSearchChange }) {
  return (
    <section aria-labelledby="payroll-results-title" className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="payroll-results-title" className="text-base font-semibold tracking-tight text-foreground">ผลคำนวณรายบุคคล</h2>
          <p className="mt-1 text-xs text-muted-foreground">แสดงตัวอย่าง {rows.length} จาก {payrollRows.length} รายการ</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <input checked={onlyReview} className="size-4 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => onOnlyReviewChange(event.target.checked)} type="checkbox" />
            เฉพาะรายการที่ต้องตรวจสอบ
          </label>
          <label className="relative min-w-0 flex-1 sm:w-44 sm:flex-none">
            <span className="sr-only">ค้นหาพนักงานในรายการเงินเดือน</span>
            <RiSearchLine aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="ค้นหาพนักงาน..."
              type="search"
              value={search}
            />
          </label>
        </div>
      </div>
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[1040px] border-collapse text-left tabular-nums">
          <thead className="bg-muted/75">
            <tr className="text-[11px] font-semibold text-muted-foreground">
              <th className="px-4 py-3 font-semibold">พนักงาน</th>
              <th className="px-3 py-3 text-right font-semibold">เงินเดือน</th>
              <th className="px-3 py-3 text-right font-semibold">OT</th>
              <th className="px-3 py-3 text-right font-semibold">เงินได้อื่น</th>
              <th className="px-3 py-3 text-right font-semibold">รวมเงินได้</th>
              <th className="px-3 py-3 text-right font-semibold">ภาษี</th>
              <th className="px-3 py-3 text-right font-semibold">ปกส.</th>
              <th className="px-3 py-3 text-right font-semibold">หักอื่น</th>
              <th className="px-3 py-3 text-right font-semibold">สุทธิ</th>
              <th className="px-4 py-3 text-center font-semibold">ตรวจสอบ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className={cn("border-t border-border text-xs transition-colors hover:bg-muted/45", row.review && "bg-status-warning/5")} key={row.id}>
                <th className="px-4 py-3 text-left font-normal">
                  <div className="flex min-w-44 items-center gap-2.5">
                    <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-semibold", row.color)}>{row.initials}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">{row.name}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{row.department}</span>
                    </span>
                  </div>
                </th>
                <td className="px-3 py-3 text-right text-foreground">{amount(row.salary)}</td>
                <td className="px-3 py-3 text-right text-muted-foreground">{amount(row.ot)}</td>
                <td className="px-3 py-3 text-right text-foreground">{amount(row.allowance)}</td>
                <td className="px-3 py-3 text-right font-semibold text-foreground">{amount(rowGross(row))}</td>
                <td className="px-3 py-3 text-right text-status-danger">{amount(row.tax)}</td>
                <td className="px-3 py-3 text-right text-status-danger">{amount(row.social)}</td>
                <td className="px-3 py-3 text-right text-status-danger">{amount(row.deduction)}</td>
                <td className="px-3 py-3 text-right font-semibold text-foreground">{amount(rowNet(row))}</td>
                <td className="px-4 py-3 text-center">
                  {row.review ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-status-warning/15 px-2 py-1 text-[10px] font-semibold text-status-warning">
                      <RiSearchEyeLine aria-hidden="true" className="size-3.5" />
                      ตรวจสอบ
                    </span>
                  ) : <span aria-label="ไม่มีรายการค้างตรวจ" className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={10}>ไม่พบพนักงานที่ตรงกับคำค้นหา</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <span>ข้อมูลตัวอย่างสำหรับหน้าจอ Mockup</span>
        <span>หน้า 1 จาก 1</span>
      </div>
    </section>
  );
}

function ExportCenter({ onDownload }) {
  const lockedReports = [
    { label: "Bank file (KBank .txt)", icon: RiBankLine },
    { label: "ภ.ง.ด.1 (ก.ย. 2569)", icon: RiFileList3Line },
    { label: "สปส.1-10 ส่วนที่ 1–2", icon: RiFileList3Line },
    { label: "สลิปเงินเดือน (PDF เข้ารหัส)", icon: RiFileList3Line },
  ];
  return (
    <section aria-labelledby="exports-title" className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 id="exports-title" className="text-base font-semibold tracking-tight text-foreground">ไฟล์ส่งออก & รายงานตามกฎหมาย</h2>
        <p className="mt-1 text-xs text-muted-foreground">ไฟล์จริงจะพร้อมหลังอนุมัติและล็อกงวด</p>
      </div>
      <ul className="mt-4 space-y-2">
        {lockedReports.map((report) => {
          const Icon = report.icon;
          return (
            <li className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-muted/35 px-3 py-2 text-xs text-muted-foreground" key={report.label}>
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{report.label}</span>
              </span>
              <RiLockLine aria-label="ล็อกจนกว่าจะอนุมัติ" className="size-4 shrink-0" />
            </li>
          );
        })}
      </ul>
      <Button className="mt-3 w-full justify-between" onClick={onDownload} variant="outline">
        <span className="flex items-center gap-2"><RiFileExcel2Line aria-hidden="true" />Payroll Register (CSV)</span>
        <RiDownload2Line aria-hidden="true" />
      </Button>
      <div className="mt-2 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2.5">
          <RiFileList3Line aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">GL Journal (CSV)</span>
        </span>
        <RiLockLine aria-label="ล็อกจนกว่าจะอนุมัติ" className="size-4 shrink-0" />
      </div>
      <p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground">ส่งออกได้เฉพาะข้อมูลตัวอย่าง 11 รายการ</p>
    </section>
  );
}

export default function PayrollModule() {
  const [search, setSearch] = useState("");
  const [onlyReview, setOnlyReview] = useState(true);
  const [notice, setNotice] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase("th-TH");
  const visibleRows = payrollRows.filter((row) => {
    const searchable = (row.name + " " + row.department + " " + row.id).toLocaleLowerCase("th-TH");
    return (!normalizedSearch || searchable.includes(normalizedSearch)) && (!onlyReview || row.review);
  });

  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow="เงินเดือน · ข้อมูลตัวอย่าง"
        title={`เงินเดือน · งวด ${period.label}`}
        description={`${period.dateRange} · บริษัท เอ จำกัด · ข้อมูลสมมติสำหรับแสดงหน้าจอ`}
        actions={(
          <>
            <label className="grid min-w-40 gap-1">
              <span className="text-xs font-medium text-muted-foreground">รอบเงินเดือน</span>
              <Select aria-label="รอบเงินเดือน" defaultSelectedKey={period.label}>
                <SelectItem id={period.label}>รายเดือน · {period.label}</SelectItem>
              </Select>
            </label>
            <Button className="self-end" onClick={() => setNotice("ส่งรายการตัวอย่างเข้าสู่ขั้นอนุมัติแล้ว")} size="sm">
              <RiCheckLine aria-hidden="true" />
              ส่งอนุมัติ
            </Button>
          </>
        )}
      />

      <section aria-label="ความคืบหน้าการจ่ายเงินเดือน" className="border-y border-border py-3">
        <ProcessTimeline />
      </section>

      <section aria-label="สรุปเงินเดือน" className="grid grid-cols-2 gap-x-5 gap-y-3 border-b border-border pb-4 sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
      </section>

      {notice ? (
        <div aria-live="polite" className="flex items-center gap-2 rounded-lg border border-status-success/20 bg-status-success/10 px-4 py-3 text-sm text-status-success">
          <RiCheckLine aria-hidden="true" className="size-4 shrink-0" />
          <span>{notice}</span>
          <button aria-label="ปิดข้อความ" className="ml-auto rounded px-2 py-1 font-medium hover:bg-status-success/10 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setNotice("")} type="button">ปิด</button>
        </div>
      ) : null}

      <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_19rem]">
        <PayrollTable onOnlyReviewChange={setOnlyReview} onSearchChange={setSearch} onlyReview={onlyReview} rows={visibleRows} search={search} />
        <aside aria-label="ไฟล์ส่งออกเงินเดือน">
          <ExportCenter onDownload={downloadRegister} />
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
        <p className="max-w-3xl text-xs leading-5 text-muted-foreground">หน้าจอนี้ใช้ข้อมูลสมมติเพื่อแสดงรูปแบบการทำงานเท่านั้น ยังไม่เชื่อมต่อข้อมูลพนักงานหรือระบบจ่ายเงินจริง</p>
        <div className="flex items-center gap-2">
          <Button onClick={() => setNotice("บันทึกรอบเงินเดือนตัวอย่างเป็นฉบับร่างแล้ว")} size="sm" variant="outline">
            <RiCalendarLine aria-hidden="true" />
            บันทึกร่าง
          </Button>
        </div>
      </div>
    </div>
  );
}
