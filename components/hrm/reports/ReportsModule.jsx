"use client";

import { useRef, useState } from "react";
import {
  RiAddLine,
  RiCalendarLine,
  RiCloseLine,
  RiFileChartLine,
  RiFilePdf2Line,
  RiInformationLine,
  RiMoneyDollarCircleLine,
  RiTimerLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const reportTypes = [
  { id: "ot", label: "โอที", description: "ชั่วโมงทำงานล่วงเวลา", icon: RiTimerLine },
  { id: "leave", label: "วันลา", description: "สิทธิ์และการใช้วันลา", icon: RiCalendarLine },
  { id: "bonus", label: "เบี้ยขยัน", description: "สรุปเบี้ยขยันรายบุคคล", icon: RiMoneyDollarCircleLine },
];

const months = [
  { id: "01", label: "มกราคม" },
  { id: "02", label: "กุมภาพันธ์" },
  { id: "03", label: "มีนาคม" },
  { id: "04", label: "เมษายน" },
  { id: "05", label: "พฤษภาคม" },
  { id: "06", label: "มิถุนายน" },
  { id: "07", label: "กรกฎาคม" },
  { id: "08", label: "สิงหาคม" },
  { id: "09", label: "กันยายน" },
  { id: "10", label: "ตุลาคม" },
  { id: "11", label: "พฤศจิกายน" },
  { id: "12", label: "ธันวาคม" },
];

const sortingFields = {
  ot: [
    { id: "position", label: "ตำแหน่ง" },
    { id: "metric", label: "ชั่วโมง OT" },
    { id: "name", label: "ชื่อพนักงาน" },
    { id: "department", label: "แผนก" },
  ],
  leave: [
    { id: "position", label: "ตำแหน่ง" },
    { id: "metric", label: "จำนวนวันลา" },
    { id: "name", label: "ชื่อพนักงาน" },
    { id: "department", label: "แผนก" },
  ],
  bonus: [
    { id: "position", label: "ตำแหน่ง" },
    { id: "metric", label: "เบี้ยขยัน" },
    { id: "name", label: "ชื่อพนักงาน" },
    { id: "department", label: "แผนก" },
  ],
};

const directions = [
  { id: "desc", label: "มากไปน้อย · Z ไป A" },
  { id: "asc", label: "น้อยไปมาก · A ไป Z" },
];

const periodTypes = [
  { id: "monthly", label: "รายเดือน" },
  { id: "yearly", label: "รายปี" },
  { id: "custom", label: "กำหนดเอง" },
];

function getYearOptions(currentYear) {
  return Array.from({ length: 7 }, (_, index) => {
    const value = String(currentYear + 1 - index);
    return { id: value, label: value };
  });
}

function getCurrentPeriod() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return {
    year: parts.find((part) => part.type === "year")?.value || "2026",
    month: parts.find((part) => part.type === "month")?.value || "01",
  };
}

function SelectField({ id, label, value, onChange, options, ariaLabel }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-xs font-medium leading-4 text-muted-foreground">{label}</label>
      <Select
        id={id}
        aria-label={ariaLabel || label}
        selectedKey={value}
        onSelectionChange={(key) => onChange(String(key))}
        className="min-w-0"
      >
        {options.map((option) => (
          <SelectItem key={option.id} id={option.id}>{option.label}</SelectItem>
        ))}
      </Select>
    </div>
  );
}

function ReportSection({ id, icon: Icon, title, description, className, children }) {
  return (
    <section aria-labelledby={id} className={cn("min-w-0", className)}>
      <Card className="h-full border-border/80 shadow-sm">
        <CardHeader className="flex-row items-center gap-3 p-4 sm:p-5">
          <div className="hrm-soft-icon rounded-lg">
            <Icon className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <CardTitle id={id} className="text-sm leading-5">{title}</CardTitle>
            <CardDescription className="mt-1 text-xs leading-4">{description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">{children}</CardContent>
      </Card>
    </section>
  );
}

function SortRuleRow({ rule, index, fields, onChange, onRemove }) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-background p-2 sm:items-end sm:gap-3">
      <span
        className="mt-1 grid size-8 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground sm:mb-1"
        aria-hidden="true"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
        <SelectField
          id={"sort-field-" + rule.id}
          label={"เงื่อนไขที่ " + (index + 1)}
          ariaLabel={"เงื่อนไขเรียงลำดับที่ " + (index + 1)}
          value={rule.field}
          options={fields}
          onChange={(field) => onChange(rule.id, { field })}
        />
        <SelectField
          id={"sort-direction-" + rule.id}
          label="ทิศทาง"
          ariaLabel={"ทิศทางการเรียงลำดับที่ " + (index + 1)}
          value={rule.direction}
          options={directions}
          onChange={(direction) => onChange(rule.id, { direction })}
        />
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={"ลบเงื่อนไขเรียงลำดับที่ " + (index + 1)}
        onClick={() => onRemove(rule.id)}
        className="mt-5 size-10 shrink-0 sm:mt-0"
      >
        <RiCloseLine aria-hidden="true" />
      </Button>
    </div>
  );
}

function ReportSwitchOption({ id, label, description, isSelected, onChange }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="min-w-0">
        <p id={id + "-label"} className="text-sm font-medium leading-5 text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        aria-labelledby={id + "-label"}
        isSelected={isSelected}
        onChange={onChange}
        className="shrink-0"
      />
    </div>
  );
}

export default function ReportsModule() {
  const currentPeriod = getCurrentPeriod();
  const currentYear = Number(currentPeriod.year);
  const years = getYearOptions(currentYear);
  const currentMonth = currentPeriod.month;

  const [reportType, setReportType] = useState("ot");
  const [periodType, setPeriodType] = useState("monthly");
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(String(currentYear));
  const [startMonth, setStartMonth] = useState("01");
  const [startYear, setStartYear] = useState(String(currentYear));
  const [endMonth, setEndMonth] = useState(currentMonth);
  const [endYear, setEndYear] = useState(String(currentYear));
  const [scope, setScope] = useState("all");
  const [sortRules, setSortRules] = useState([{ id: 1, field: "position", direction: "desc" }]);
  const [showTable, setShowTable] = useState(false);
  const [newPageByMonth, setNewPageByMonth] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const nextSortId = useRef(2);

  const fields = sortingFields[reportType];
  const startValue = Number(startYear) * 12 + Number(startMonth);
  const endValue = Number(endYear) * 12 + Number(endMonth);
  const customPeriodInvalid = periodType === "custom" && startValue > endValue;
  const selectedReport = reportTypes.find((item) => item.id === reportType);

  function updateSortRule(id, updates) {
    setSortRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  }

  function addSortRule() {
    const id = nextSortId.current;
    nextSortId.current += 1;
    setSortRules((current) => [...current, { id, field: "name", direction: "asc" }]);
  }

  function removeSortRule(id) {
    setSortRules((current) => current.filter((rule) => rule.id !== id));
  }

  const monthLabel = (value) => months.find((item) => item.id === value)?.label || "";
  const periodLabel = periodType === "monthly"
    ? monthLabel(month) + " " + year
    : periodType === "yearly"
      ? "ปี " + year
      : monthLabel(startMonth) + " " + startYear + " – " + monthLabel(endMonth) + " " + endYear;
  const sortingLabel = sortRules.length
    ? sortRules.map((rule) => {
        const field = fields.find((item) => item.id === rule.field)?.label || "ลำดับเริ่มต้น";
        const direction = rule.direction === "desc" ? "มากไปน้อย" : "น้อยไปมาก";
        return field + " " + direction;
      }).join(" · ")
    : "ลำดับเริ่มต้น";

  const settingsPanel = (
    <div className="mt-4 space-y-4">
      <ReportSection
        id="report-period-title"
        icon={RiCalendarLine}
        title="ช่วงเวลา · Time period"
        description="เลือกรอบเวลาที่ต้องการนำไปใช้กับรายงาน"
      >
        <div role="group" aria-label="รูปแบบช่วงเวลา" className="flex flex-wrap gap-2">
          {periodTypes.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={periodType === item.id ? "default" : "outline"}
              aria-pressed={periodType === item.id}
              onClick={() => {
                setPeriodType(item.id);
                setExportNotice("");
              }}
              className="min-h-10 px-4"
            >
              {item.label}
            </Button>
          ))}
        </div>

        {periodType === "monthly" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField id="report-month" label="เดือน" value={month} onChange={setMonth} options={months} />
            <SelectField id="report-year" label="ปี" value={year} onChange={setYear} options={years} />
          </div>
        ) : null}

        {periodType === "yearly" ? (
          <div className="max-w-sm">
            <SelectField id="report-yearly-year" label="ปี" value={year} onChange={setYear} options={years} />
          </div>
        ) : null}

        {periodType === "custom" ? (
          <div className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <fieldset className="min-w-0 rounded-lg border border-border bg-muted/30 p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">เริ่มต้น</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField id="report-start-month" label="เดือน" value={startMonth} onChange={setStartMonth} options={months} />
                  <SelectField id="report-start-year" label="ปี" value={startYear} onChange={setStartYear} options={years} />
                </div>
              </fieldset>
              <fieldset className="min-w-0 rounded-lg border border-border bg-muted/30 p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">สิ้นสุด</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField id="report-end-month" label="เดือน" value={endMonth} onChange={setEndMonth} options={months} />
                  <SelectField id="report-end-year" label="ปี" value={endYear} onChange={setEndYear} options={years} />
                </div>
              </fieldset>
            </div>
            {customPeriodInvalid ? (
              <p id="custom-period-error" role="alert" className="text-xs leading-5 text-status-danger">
                เดือนเริ่มต้นต้องไม่อยู่หลังเดือนสิ้นสุด
              </p>
            ) : null}
          </div>
        ) : null}
      </ReportSection>

      <div className="grid gap-4 xl:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.2fr)]">
        <ReportSection
          id="report-scope-title"
          icon={RiFileChartLine}
          title="ขอบเขตข้อมูล · Scope"
          description="กำหนดการจัดกลุ่มข้อมูลในรายงาน"
        >
          <fieldset className="space-y-2">
            <legend className="sr-only">รูปแบบการรวมพนักงาน</legend>
            {[
              { id: "all", title: "พนักงานทั้งหมด", detail: "รวมข้อมูลไว้ในรายงานฉบับเดียว" },
              { id: "individual", title: "แยกตามพนักงาน", detail: "แสดงข้อมูลของแต่ละคนแยกจากกัน" },
            ].map((option) => (
              <label
                key={option.id}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-ring",
                  scope === option.id ? "border-primary/50 bg-primary/5" : "border-border bg-background hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name="report-scope"
                  value={option.id}
                  checked={scope === option.id}
                  onChange={() => setScope(option.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-5 text-foreground">{option.title}</span>
                  <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{option.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </ReportSection>

        <ReportSection
          id="report-sorting-title"
          icon={RiFileChartLine}
          title="การเรียงลำดับ · Sorting"
          description="เรียงข้อมูลตามลำดับความสำคัญที่กำหนด"
        >
          {sortRules.length ? (
            <div className="space-y-2">
              {sortRules.map((rule, index) => (
                <SortRuleRow
                  key={rule.id}
                  rule={rule}
                  index={index}
                  fields={fields}
                  onChange={updateSortRule}
                  onRemove={removeSortRule}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs leading-5 text-muted-foreground">
              ยังไม่มีเงื่อนไข ระบบจะใช้ลำดับเริ่มต้นเมื่อสร้างรายงาน
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            leadingIcon={RiAddLine}
            onClick={addSortRule}
            className="min-h-10 text-primary"
          >
            เพิ่มเงื่อนไขการเรียง
          </Button>
        </ReportSection>
      </div>

      {periodType !== "monthly" ? (
        <ReportSection
          id="report-display-title"
          icon={RiFileChartLine}
          title="รูปแบบรายงาน · Display"
          description="เลือกวิธีแสดงข้อมูลและจัดหน้าเอกสาร"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {periodType === "yearly" ? (
              <ReportSwitchOption
                id="report-table"
                label="แสดงข้อมูลแบบตาราง"
                description="จัดข้อมูลเป็นแถวและคอลัมน์"
                isSelected={showTable}
                onChange={setShowTable}
              />
            ) : null}
            <ReportSwitchOption
              id="report-page-break"
              label="แยกหน้าใหม่ตามเดือน"
              description="เริ่มหน้าใหม่เมื่อเปลี่ยนเดือน"
              isSelected={newPageByMonth}
              onChange={setNewPageByMonth}
            />
          </div>
        </ReportSection>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-4 text-muted-foreground">สรุปการตั้งค่า</p>
            <p className="mt-1 text-sm font-medium leading-5 text-foreground">
              {selectedReport?.label} · {periodLabel} · {scope === "all" ? "พนักงานทั้งหมด" : "แยกตามพนักงาน"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">เรียงตาม {sortingLabel}</p>
            {(periodType === "yearly" && showTable) || (periodType !== "monthly" && newPageByMonth) ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                รูปแบบ: {
                  [
                    periodType === "yearly" && showTable ? "ตาราง" : null,
                    periodType !== "monthly" && newPageByMonth ? "แยกหน้าตามเดือน" : null,
                  ].filter(Boolean).join(" · ")
                }
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <Button
              type="button"
              size="lg"
              leadingIcon={RiFilePdf2Line}
              onClick={() => setExportNotice("ตั้งค่ารายงานแล้ว ส่วนการดึงข้อมูลและสร้างไฟล์ PDF จะเชื่อมต่อในขั้นตอนถัดไป")}
              disabled={customPeriodInvalid}
              className="w-full sm:w-auto"
            >
              สร้างรายงาน PDF
            </Button>
            <p className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
              <RiInformationLine className="size-4 shrink-0" aria-hidden="true" />
              ยังไม่ได้เชื่อมต่อการดึงข้อมูลและสร้าง PDF
            </p>
          </div>
        </CardContent>
      </Card>
      {exportNotice ? (
        <p role="status" className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-5 text-foreground">
          {exportNotice}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase leading-4 tracking-[0.08em] text-primary">People operations · Reports</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">สร้างรายงาน</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            เลือกหมวดและกำหนดรูปแบบรายงานก่อนส่งออก
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-lg border border-border bg-card px-3 py-2 sm:self-auto">
          <RiFileChartLine className="size-4 text-primary" aria-hidden="true" />
          <span className="text-xs font-medium text-muted-foreground">ตัวสร้างรายงาน</span>
        </div>
      </header>

      <Tabs selectedKey={reportType} onSelectionChange={(key) => setReportType(String(key))}>
        <TabList
          aria-label="หมวดรายงาน"
          className="grid w-full grid-cols-3 gap-1 overflow-visible rounded-xl border border-border bg-card p-1 shadow-sm"
        >
          {reportTypes.map((item) => (
            <Tab
              key={item.id}
              id={item.id}
              icon={item.icon}
              className="min-h-14 w-full flex-col items-start justify-center gap-1 whitespace-normal px-2 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-muted sm:min-h-16 sm:flex-row sm:items-center sm:gap-3 sm:px-4"
            >
              <span className="text-xs font-semibold leading-4 sm:text-sm">{item.label}</span>
              <span className="hidden text-[11px] font-normal leading-4 opacity-75 sm:inline">{item.description}</span>
            </Tab>
          ))}
        </TabList>
        {reportTypes.map((item) => (
          <TabPanel key={item.id} id={item.id} className="mt-0">
            {settingsPanel}
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}
