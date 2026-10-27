"use client";

import { useEffect, useRef, useState } from "react";
import {
  RiAddLine,
  RiCalendarLine,
  RiCheckLine,
  RiCloseLine,
  RiFileChartLine,
  RiFilePdf2Line,
  RiInformationLine,
  RiMoneyDollarCircleLine,
  RiTimerLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/hrm/PageHeader";
import { cn } from "@/lib/utils";
import { OT_REPORT_VARIANTS } from "@/lib/reports/ot/options";

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

function getReportVariant({ periodType, scope, separateMonthColumns, appendMonthlyDetails, showDetail }) {
  if (periodType === "custom") return null;
  let variant;
  if (periodType === "monthly") {
    variant = scope === "all" ? "monthly-all" : showDetail ? "monthly-individual-detail" : "monthly-individual";
  } else {
    variant = `yearly-${scope}`;
    if (separateMonthColumns) variant += "-month-columns";
    else if (appendMonthlyDetails) variant += "-month-pages";
    if (scope === "individual" && showDetail) variant += "-detail";
  }
  return OT_REPORT_VARIANTS.some((item) => item.id === variant) ? variant : null;
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
      <Card className="h-full border-border/80">
        <CardHeader className="flex-row items-center gap-2.5 p-3 sm:p-4">
          <div className="hrm-soft-icon size-9 rounded-lg">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <CardTitle id={id} className="text-sm leading-5">{title}</CardTitle>
            <CardDescription className="mt-0.5 text-[11px] leading-4">{description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-3 pt-0 sm:p-4 sm:pt-0">{children}</CardContent>
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
  const [separateMonthColumns, setSeparateMonthColumns] = useState(false);
  const [appendMonthlyDetails, setAppendMonthlyDetails] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const [exportNoticeIsError, setExportNoticeIsError] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [canViewCompany, setCanViewCompany] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const nextSortId = useRef(2);

  const fields = sortingFields[reportType];
  const startValue = Number(startYear) * 12 + Number(startMonth);
  const endValue = Number(endYear) * 12 + Number(endMonth);
  const customPeriodInvalid = periodType === "custom" && startValue > endValue;
  const selectedReport = reportTypes.find((item) => item.id === reportType);
  const selectedEmployees = employees.filter((employee) => selectedEmployeeIds.includes(employee.id));
  const selectedEmployeeCount = selectedEmployeeIds.length;
  const visibleEmployees = employees.filter((employee) => {
    const term = employeeSearch.trim().toLocaleLowerCase("th");
    return !term || `${employee.code} ${employee.name} ${employee.departmentName}`.toLocaleLowerCase("th").includes(term);
  });
  const duplicateSortFields = new Set(sortRules.map((rule) => rule.field)).size !== sortRules.length;
  const sortRulesInvalid = sortRules.length > 4 || duplicateSortFields;
  const reportVariant = getReportVariant({ periodType, scope, separateMonthColumns, appendMonthlyDetails, showDetail });
  const reportSupported = reportType === "ot" || reportType === "leave";
  const exportSupported = reportSupported && periodType !== "custom" && Boolean(reportVariant);
  const yearNumber = Number(year);
  const canExport = exportSupported
    && !optionsLoading
    && !optionsError
    && !isExporting
    && !customPeriodInvalid
    && Number.isInteger(yearNumber)
    && yearNumber >= 2000
    && yearNumber <= 2100
    && !sortRulesInvalid
    && (scope === "all" || (selectedEmployeeCount > 0 && selectedEmployeeCount <= 100));

  useEffect(() => {
    const controller = new AbortController();
    setEmployees([]);
    setSelectedEmployeeIds([]);
    setCanViewCompany(false);
    setOptionsError("");
    if (reportType !== "ot" && reportType !== "leave") {
      setOptionsLoading(false);
      return () => controller.abort();
    }
    setOptionsLoading(true);
    fetch(`/api/reports/${reportType}/options`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "ไม่สามารถโหลดรายชื่อพนักงานได้");
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const allowedEmployees = Array.isArray(payload.employees) ? payload.employees : [];
        setEmployees(allowedEmployees);
        setCanViewCompany(payload.canViewCompany === true);
        if (payload.canViewCompany !== true) {
          setScope("individual");
          setSelectedEmployeeIds(allowedEmployees[0]?.id ? [allowedEmployees[0].id] : []);
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError" && !controller.signal.aborted) setOptionsError(error.message || "ไม่สามารถโหลดรายชื่อพนักงานได้");
      })
      .finally(() => {
        if (!controller.signal.aborted) setOptionsLoading(false);
      });
    return () => controller.abort();
  }, [optionsAttempt, reportType]);

  function updateSortRule(id, updates) {
    setSortRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  }

  function addSortRule() {
    if (sortRules.length >= 4) {
      setExportNotice("เพิ่มเงื่อนไขการเรียงได้ไม่เกิน 4 รายการ");
      setExportNoticeIsError(true);
      return;
    }
    const nextField = fields.find((field) => !sortRules.some((rule) => rule.field === field.id));
    if (!nextField) {
      setExportNotice("เลือกเงื่อนไขการเรียงแต่ละรายการให้ไม่ซ้ำกัน");
      setExportNoticeIsError(true);
      return;
    }
    const id = nextSortId.current;
    nextSortId.current += 1;
    setSortRules((current) => [...current, { id, field: nextField.id, direction: "asc" }]);
  }

  function removeSortRule(id) {
    setSortRules((current) => current.filter((rule) => rule.id !== id));
  }

  function toggleEmployee(employeeId, checked) {
    setSelectionError("");
    if (!checked) {
      setSelectedEmployeeIds((current) => current.filter((id) => id !== employeeId));
      return;
    }
    if (selectedEmployeeIds.includes(employeeId)) return;
    if (selectedEmployeeIds.length >= 100) {
      setSelectionError("เลือกพนักงานได้ไม่เกิน 100 คนต่อไฟล์");
      return;
    }
    setSelectedEmployeeIds((current) => current.includes(employeeId) ? current : [...current, employeeId]);
  }

  function setFilteredEmployees(checked) {
    const filteredIds = visibleEmployees.map((employee) => employee.id);
    setSelectionError("");
    if (!checked) {
      setSelectedEmployeeIds((current) => current.filter((id) => !filteredIds.includes(id)));
      return;
    }
    const pending = filteredIds.filter((id) => !selectedEmployeeIds.includes(id));
    const available = Math.max(0, 100 - selectedEmployeeIds.length);
    setSelectedEmployeeIds((current) => [...current, ...pending.slice(0, available).filter((id) => !current.includes(id))]);
    if (pending.length > available) setSelectionError("เลือกพนักงานได้ไม่เกิน 100 คนต่อไฟล์");
  }

  async function downloadReport() {
    if (!canExport || !reportVariant || !reportSupported) return;
    setIsExporting(true);
    setExportNotice("");
    setExportNoticeIsError(false);
    const payload = {
      variant: reportVariant,
      year: yearNumber,
      ...(periodType === "monthly" ? { month: Number(month) } : {}),
      ...(scope === "individual" ? { employeeIds: selectedEmployeeIds } : {}),
      sortRules: sortRules.map(({ field, direction }) => ({ field: field === "metric" ? (reportType === "leave" ? "days" : "hours") : field, direction })),
    };
    try {
      const response = await fetch(`/api/reports/${reportType}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const message = contentType.includes("application/json")
          ? (await response.json()).error
          : "ไม่สามารถสร้างไฟล์รายงานได้ในขณะนี้";
        throw new Error(message || "ไม่สามารถสร้างไฟล์รายงานได้ในขณะนี้");
      }
      let blob;
      let filename;
      if (reportType === "ot") {
        const report = await response.json();
        const { createOtReportPdf } = await import("./ot-pdf-client");
        blob = await createOtReportPdf(report.report);
        filename = report.filename || `ot-report-${reportVariant}-${yearNumber}.pdf`;
      } else {
        blob = await response.blob();
        const disposition = response.headers.get("content-disposition") || "";
        filename = disposition.match(/filename="([^"]+)"/)?.[1] || `${reportType}-report-${reportVariant}-${yearNumber}.pdf`;
      }
      if (blob.type !== "application/pdf" || blob.size < 5) throw new Error("ระบบสร้างไฟล์ PDF ไม่ถูกต้อง");
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setExportNotice("ดาวน์โหลด PDF แล้ว");
      setExportNoticeIsError(false);
    } catch (error) {
      setExportNotice(error.message || "ไม่สามารถสร้างไฟล์รายงานได้ในขณะนี้");
      setExportNoticeIsError(true);
    } finally {
      setIsExporting(false);
    }
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
    <div className="mt-3 space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
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

        <ReportSection
          id="report-scope-title"
          icon={RiFileChartLine}
          title="ขอบเขตข้อมูล · Scope"
          description="กำหนดการจัดกลุ่มข้อมูลในรายงาน"
        >
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">รูปแบบการรวมพนักงาน</legend>
            {[
              { id: "all", title: "พนักงานทั้งหมด", detail: "รวมข้อมูลไว้ในรายงานฉบับเดียว" },
              { id: "individual", title: "แยกตามพนักงาน", detail: "แสดงข้อมูลของแต่ละคนแยกจากกัน" },
            ].map((option) => (
              <label
                key={option.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors focus-within:ring-2 focus-within:ring-ring",
                  scope === option.id ? "border-primary/50 bg-primary/5" : "border-border bg-background hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name="report-scope"
                  value={option.id}
                  checked={scope === option.id}
                  disabled={option.id === "all" && !canViewCompany}
                  onChange={() => {
                    setScope(option.id);
                    setExportNotice("");
                    setExportNoticeIsError(false);
                    setSelectionError("");
                    if (option.id === "all") setShowDetail(false);
                  }}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium leading-4 text-foreground">{option.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{option.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {(reportType === "ot" || reportType === "leave") && optionsError ? (
            <div className="flex flex-wrap items-center gap-2" role="alert">
              <p className="text-xs leading-5 text-status-danger">{optionsError}</p>
              <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => {
                setOptionsError("");
                setOptionsAttempt((current) => current + 1);
              }}>ลองโหลดรายชื่ออีกครั้ง</Button>
            </div>
          ) : null}
          {(reportType === "ot" || reportType === "leave") && scope === "individual" ? (
            <div className="space-y-2.5 border-t border-border pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground">เลือกพนักงาน · {selectedEmployeeCount}/100</p>
                {canViewCompany ? (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => setFilteredEmployees(true)} disabled={optionsLoading || !visibleEmployees.length}>เลือกผลการค้นหา</Button>
                    <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={() => setSelectedEmployeeIds([])} disabled={!selectedEmployeeCount}>ล้าง</Button>
                  </div>
                ) : null}
              </div>
              {canViewCompany ? (
                <Input
                  id="report-employee-search"
                  label="ค้นหาด้วยรหัส ชื่อ หรือแผนก"
                  type="search"
                  value={employeeSearch}
                  onChange={setEmployeeSearch}
                  placeholder="ค้นหาพนักงาน"
                />
              ) : null}
              <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-background" role="group" aria-label="รายชื่อพนักงานสำหรับรายงาน">
                {optionsLoading ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground" role="status">กำลังโหลดรายชื่อพนักงาน…</p>
                ) : optionsError ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">กรุณาลองโหลดรายชื่ออีกครั้ง</p>
                ) : visibleEmployees.length ? visibleEmployees.map((employee) => {
                  const checkboxId = `report-employee-${employee.id}`;
                  return (
                    <label key={employee.id} htmlFor={checkboxId} className="flex min-h-10 cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 last:border-0">
                      <Checkbox
                        id={checkboxId}
                        aria-label={`${employee.code} ${employee.name}`}
                        isSelected={selectedEmployeeIds.includes(employee.id)}
                        isDisabled={!canViewCompany}
                        onChange={(checked) => toggleEmployee(employee.id, checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">{employee.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{employee.code} · {employee.departmentName}</span>
                      </span>
                    </label>
                  );
                }) : (
                  <p className="px-3 py-3 text-xs text-muted-foreground">ไม่พบพนักงานตามคำค้นหา</p>
                )}
              </div>
              {selectedEmployees.length ? (
                <p className="text-[11px] leading-4 text-muted-foreground" aria-live="polite">
                  เลือกแล้ว {selectedEmployeeCount} คน · {selectedEmployees.map((employee) => employee.code).join(", ")}
                </p>
              ) : null}
              {selectionError ? <p role="alert" className="text-xs text-status-danger">{selectionError}</p> : null}
              <ReportSwitchOption
                id="report-daily-detail"
                label="แสดงรายละเอียดรายวัน"
                description={reportType === "leave" ? "แสดงวันที่ ประเภท ช่วงเวลา จำนวนวัน และเหตุผลของแต่ละรายการ" : "แสดงรายการ OT พร้อมวันที่ เวลา ชั่วโมง และเหตุผลของแต่ละคำขอ"}
                isSelected={showDetail}
                onChange={setShowDetail}
              />
            </div>
          ) : null}
        </ReportSection>
      </div>

      <div className={cn(
        "grid gap-3",
        periodType !== "monthly" && "xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]",
      )}>
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
          {sortRulesInvalid ? (
            <p role="alert" className="text-xs leading-5 text-status-danger">เลือกเงื่อนไขเรียงลำดับไม่ซ้ำกันและไม่เกิน 4 รายการ</p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            leadingIcon={RiAddLine}
            onClick={addSortRule}
            disabled={sortRules.length >= 4 || !fields.some((field) => !sortRules.some((rule) => rule.field === field.id))}
            className="min-h-10 text-primary"
          >
            เพิ่มเงื่อนไขการเรียง
          </Button>
        </ReportSection>

      {periodType !== "monthly" ? (
        <ReportSection
          id="report-display-title"
          icon={RiFileChartLine}
          title={periodType === "yearly" ? "รูปแบบรายปี · Annual display" : "รายละเอียดรายเดือน"}
          description={periodType === "yearly" ? "เลือกมุมมองตารางทั้งปีและหน้าแยกรายเดือน" : "แนบรายละเอียดรายเดือนต่อท้ายสรุป"}
        >
          <div className={cn("grid gap-3", periodType === "yearly" && "sm:grid-cols-2")}>
            {periodType === "yearly" ? (
              <ReportSwitchOption
                id="report-month-columns"
                label="แยกคอลัมน์เดือน (Table View)"
                description="แสดงตารางต่อเนื่องตลอดทั้งปี"
                isSelected={separateMonthColumns}
                onChange={(selected) => {
                  setSeparateMonthColumns(selected);
                  if ((reportType === "ot" || reportType === "leave") && selected) setAppendMonthlyDetails(false);
                }}
              />
            ) : null}
            <ReportSwitchOption
              id="report-monthly-details"
              label="แนบหน้ารายเดือน"
              description="เพิ่มหน้าแยกรายละเอียดแต่ละเดือนต่อท้ายสรุป"
              isSelected={appendMonthlyDetails}
              onChange={(selected) => {
                setAppendMonthlyDetails(selected);
                if ((reportType === "ot" || reportType === "leave") && selected) setSeparateMonthColumns(false);
              }}
            />
          </div>
        </ReportSection>
      ) : null}
      </div>

      <Card className="border-border/80">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-4 text-muted-foreground">สรุปการตั้งค่า</p>
            <p className="mt-1 text-sm font-medium leading-5 text-foreground">
              {selectedReport?.label} · {periodLabel} · {scope === "all" ? "พนักงานทั้งหมด" : "แยกตามพนักงาน"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">เรียงตาม {sortingLabel}</p>
            {(periodType === "yearly" && separateMonthColumns) || (periodType !== "monthly" && appendMonthlyDetails) ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                รูปแบบ: {
                  [
                    periodType === "yearly" && separateMonthColumns ? "แยกคอลัมน์เดือน" : null,
                    periodType !== "monthly" && appendMonthlyDetails ? "แนบหน้ารายเดือน" : null,
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
              onClick={downloadReport}
              disabled={!canExport}
              className="w-full sm:w-auto"
            >
              {isExporting ? "กำลังสร้าง PDF…" : "สร้างรายงาน PDF"}
            </Button>
            <p className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
              <RiInformationLine className="size-4 shrink-0" aria-hidden="true" />
              {reportType === "bonus"
                ? "รายงานหมวดนี้ยังไม่พร้อมส่งออก"
                : periodType === "custom"
                  ? `รายงาน${reportType === "leave" ? "วันลา" : " OT"}รองรับช่วงเวลาแบบรายเดือนหรือรายปี`
                  : optionsError
                    ? "โหลดรายชื่อพนักงานไม่สำเร็จ กรุณาลองโหลดอีกครั้ง"
                    : optionsLoading
                      ? "กำลังโหลดสิทธิ์และรายชื่อพนักงาน"
                      : scope === "individual" && !selectedEmployeeCount
                        ? "เลือกพนักงานอย่างน้อยหนึ่งคนก่อนสร้างรายงาน"
                        : sortRulesInvalid
                          ? "แก้ไขเงื่อนไขเรียงลำดับที่ซ้ำกันก่อนสร้างรายงาน"
                          : isExporting
                            ? `กำลังเตรียมไฟล์รายงาน${reportType === "leave" ? "วันลา" : " OT"}`
                            : reportType === "leave" ? "รวมเฉพาะรายการวันลาที่อนุมัติแล้ว" : "รวมเฉพาะรายการ OT ที่อนุมัติแล้ว"}
            </p>
          </div>
        </CardContent>
      </Card>
      {exportNotice ? (
        <p
          role={exportNoticeIsError ? "alert" : "status"}
          className={cn(
            "rounded-lg border px-4 py-3 text-sm leading-5",
            exportNoticeIsError ? "border-status-danger/20 bg-status-danger/5 text-status-danger" : "border-primary/20 bg-primary/5 text-foreground",
          )}
        >
          {exportNotice}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow="ข้อมูล · รายงาน"
        title="สร้างรายงาน"
        description="เลือกหมวด ช่วงเวลา และรูปแบบก่อนส่งออก"
      />

      <Tabs
        selectedKey={reportType}
        onSelectionChange={(key) => {
          const nextType = String(key);
          setReportType(nextType);
          setEmployees([]);
          setSelectedEmployeeIds([]);
          setCanViewCompany(false);
          setOptionsError("");
          setOptionsLoading(nextType === "ot" || nextType === "leave");
          if ((nextType === "ot" || nextType === "leave") && separateMonthColumns && appendMonthlyDetails) setAppendMonthlyDetails(false);
          setExportNotice("");
          setExportNoticeIsError(false);
        }}
      >
        <TabList
          aria-label="หมวดรายงาน"
          className="grid w-full grid-cols-3 gap-2 overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none"
        >
          {reportTypes.map((item) => (
            <Tab
              key={item.id}
              id={item.id}
              icon={item.icon}
              className="relative min-h-14 w-full justify-start gap-2 whitespace-normal rounded-lg border border-border bg-card px-2 py-2 text-left shadow-sm data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:ring-1 data-[state=active]:ring-primary/20 data-[state=inactive]:hover:border-primary/40 data-[state=inactive]:hover:bg-muted/40 sm:gap-2.5 sm:px-3 [&_svg]:size-4"
            >
              <span className="min-w-0 text-left">
                <span className="block text-[11px] font-semibold leading-4 sm:text-sm">{item.label}</span>
                <span className="mt-0.5 hidden text-[11px] font-normal leading-4 text-muted-foreground sm:block">{item.description}</span>
              </span>
              {reportType === item.id ? (
                <span aria-hidden="true" className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                  <RiCheckLine className="size-3" />
                </span>
              ) : null}
            </Tab>
          ))}
        </TabList>
        <TabPanel key={reportType} id={reportType} className="mt-0">
          {settingsPanel}
        </TabPanel>
      </Tabs>
    </div>
  );
}
