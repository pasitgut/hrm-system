"use client";

import { useEffect, useState } from "react";
import { RiFileChartLine, RiRefreshLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";

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

const sortOptions = [
  { id: "code", label: "รหัสพนักงาน" },
  { id: "name", label: "ชื่อพนักงาน" },
  { id: "department", label: "แผนก" },
];

const documentTypes = [
  { id: ".xlsx", label: ".xlsx" },
  { id: ".pdf", label: ".pdf" },
];

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

function SelectField({ id, label, value, onChange, options }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <Select
        id={id}
        aria-label={label}
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

function RadioOption({ name, value, selectedValue, onChange, title, description }) {
  const id = `${name}-${value}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-ring",
        selectedValue === value ? "border-primary/50 bg-primary/5" : "border-border bg-background hover:bg-muted/40",
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={selectedValue === value}
        onChange={() => onChange(value)}
        className="size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-5 text-foreground">{title}</span>
        {description ? <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}

export default function SocialSecurityReportForm({ canExport = false }) {
  const currentPeriod = getCurrentPeriod();
  const currentYear = Number(currentPeriod.year);
  const yearOptions = Array.from({ length: 8 }, (_, index) => {
    const value = String(currentYear - 5 + index);
    return { id: value, label: value };
  });

  const [employeeScope, setEmployeeScope] = useState("department");
  const [employeeCode, setEmployeeCode] = useState("");
  const [departments, setDepartments] = useState([]);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [departmentsError, setDepartmentsError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [year, setYear] = useState(currentPeriod.year);
  const [month, setMonth] = useState(currentPeriod.month);
  const [sortBy, setSortBy] = useState("code");
  const [documentType, setDocumentType] = useState(".xlsx");
  const [submissionType, setSubmissionType] = useState("normal");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportSuccess, setExportSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setDepartmentsLoading(true);
    setDepartmentsError("");

    fetch("/api/departments", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "โหลดรายชื่อแผนกไม่สำเร็จ");
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const items = Array.isArray(payload.items) ? payload.items : [];
        setDepartments(items.filter((item) => item?.isActive !== false && item?.id && item?.name));
      })
      .catch((error) => {
        if (error.name !== "AbortError" && !controller.signal.aborted) {
          setDepartmentsError(error.message || "โหลดรายชื่อแผนกไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDepartmentsLoading(false);
      });

    return () => controller.abort();
  }, [loadAttempt]);

  function toggleDepartment(departmentId, checked) {
    setSelectedDepartmentIds((current) => (
      checked
        ? current.includes(departmentId) ? current : [...current, departmentId]
        : current.filter((id) => id !== departmentId)
    ));
  }

  function selectAllDepartments() {
    setSelectedDepartmentIds(departments.map((department) => department.id));
  }

  const hasScopeSelection = employeeScope === "department"
    ? selectedDepartmentIds.length > 0
    : employeeCode.trim().length > 0;
  const exportDisabled = !canExport
    || documentType !== ".xlsx"
    || isExporting
    || !hasScopeSelection
    || (employeeScope === "department" && (departmentsLoading || Boolean(departmentsError)));

  const exportHelp = exportError || exportSuccess || (isExporting
    ? "กำลังสร้างไฟล์ Excel…"
    : !canExport
      ? "ต้องมีสิทธิ์ดูและส่งออกสลิปเงินเดือนเพื่อสร้างไฟล์นี้"
      : documentType === ".pdf"
      ? "ขณะนี้ส่งออกได้เฉพาะไฟล์ .xlsx"
      : employeeScope === "department" && departmentsLoading
        ? "กำลังโหลดรายชื่อแผนก…"
        : employeeScope === "department" && departmentsError
          ? "โหลดรายชื่อแผนกไม่สำเร็จ กรุณาลองอีกครั้ง"
          : employeeScope === "department" && !selectedDepartmentIds.length
            ? "เลือกอย่างน้อยหนึ่งแผนกก่อนส่งออก"
            : employeeScope === "employee" && !employeeCode.trim()
              ? "กรอกรหัสพนักงานก่อนส่งออก"
              : "ไฟล์จะมีคอลัมน์ A–F ตามรูปแบบที่กำหนด");

  async function exportXlsx() {
    if (exportDisabled) return;
    setIsExporting(true);
    setExportError("");
    setExportSuccess("");
    try {
      const response = await fetch("/api/payroll/social-security/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          scope: employeeScope,
          employeeCode: employeeCode.trim(),
          departmentIds: selectedDepartmentIds,
          sortBy,
          submissionType,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "สร้างไฟล์ Excel ไม่สำเร็จ");
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error("ไฟล์ Excel ที่สร้างไม่มีข้อมูล");
      const contentDisposition = response.headers.get("content-disposition") || "";
      const filename = contentDisposition.match(/filename="([^"]+)"/)?.[1]
        || `sso-1-10-${year}-${month}-${submissionType}.xlsx`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setExportSuccess("ดาวน์โหลดไฟล์ Excel แล้ว");
    } catch (error) {
      setExportError(error.message || "สร้างไฟล์ Excel ไม่สำเร็จ");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Card className="mt-3 border-border/80">
      <CardHeader className="border-b border-border px-4 py-4 sm:px-5">
        <CardTitle className="text-base leading-6">รายการแสดงนำส่งเงินสมทบ [สปส. 1-10]</CardTitle>
        <CardDescription>กำหนดกลุ่มพนักงาน งวดนำส่ง และรูปแบบเอกสาร</CardDescription>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        <div className={cn(
          "grid min-w-0 gap-5",
          employeeScope === "department" && "xl:grid-cols-[minmax(0,1fr)_minmax(17rem,0.72fr)]",
        )}>
          <div className="min-w-0 space-y-5">
            <fieldset className="grid gap-2.5">
              <legend className="mb-2 text-sm font-medium text-foreground">พนักงาน</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <RadioOption
                  name="social-security-scope"
                  value="department"
                  selectedValue={employeeScope}
                  onChange={setEmployeeScope}
                  title="แผนก"
                  description="เลือกพนักงานตามแผนก"
                />
                <RadioOption
                  name="social-security-scope"
                  value="employee"
                  selectedValue={employeeScope}
                  onChange={setEmployeeScope}
                  title="รหัสพนักงาน"
                  description="ระบุพนักงานเป็นรายคน"
                />
              </div>
            </fieldset>

            {employeeScope === "employee" ? (
              <div className="max-w-md">
                <Input
                  id="social-security-employee-code"
                  label="รหัสพนักงาน"
                  value={employeeCode}
                  onChange={setEmployeeCode}
                  placeholder="กรอกรหัสพนักงาน"
                  autoComplete="off"
                />
              </div>
            ) : null}

            <fieldset className="grid gap-2.5">
              <legend className="text-sm font-medium text-foreground">งวดนำส่ง</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField id="social-security-year" label="ปี ค.ศ." value={year} onChange={setYear} options={yearOptions} />
                <SelectField id="social-security-month" label="เดือน" value={month} onChange={setMonth} options={months} />
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField id="social-security-sort" label="เรียงลำดับตาม" value={sortBy} onChange={setSortBy} options={sortOptions} />
              <SelectField id="social-security-format" label="ประเภทเอกสาร" value={documentType} onChange={setDocumentType} options={documentTypes} />
            </div>

            <fieldset className="grid gap-2.5">
              <legend className="mb-0.5 text-sm font-medium text-foreground">ประเภทการยื่น</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <RadioOption
                  name="social-security-submission"
                  value="normal"
                  selectedValue={submissionType}
                  onChange={setSubmissionType}
                  title="ยื่นปกติ"
                />
                <RadioOption
                  name="social-security-submission"
                  value="additional"
                  selectedValue={submissionType}
                  onChange={setSubmissionType}
                  title="ยื่นเพิ่มเติม"
                />
              </div>
            </fieldset>
          </div>

          {employeeScope === "department" ? (
            <fieldset className="min-w-0 rounded-md border border-border">
              <legend className="ml-3 px-1 text-sm font-medium text-foreground">แผนก</legend>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  เลือกแล้ว {selectedDepartmentIds.length} จาก {departments.length} แผนก
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="ghost" size="xs" onClick={selectAllDepartments} disabled={departmentsLoading || !departments.length}>
                    เลือกทั้งหมด
                  </Button>
                  <Button type="button" variant="ghost" size="xs" onClick={() => setSelectedDepartmentIds([])} disabled={!selectedDepartmentIds.length}>
                    ล้าง
                  </Button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto">
                {departmentsLoading ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground" role="status">กำลังโหลดรายชื่อแผนก…</p>
                ) : departmentsError ? (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-3" role="alert">
                    <p className="text-sm text-status-danger">{departmentsError}</p>
                    <Button type="button" variant="outline" size="sm" leadingIcon={RiRefreshLine} onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
                      ลองอีกครั้ง
                    </Button>
                  </div>
                ) : departments.length ? (
                  departments.map((department) => {
                    const checkboxId = `social-security-department-${department.id}`;
                    return (
                      <label key={department.id} htmlFor={checkboxId} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-0 hover:bg-muted/40">
                        <Checkbox
                          id={checkboxId}
                          isSelected={selectedDepartmentIds.includes(department.id)}
                          onChange={(checked) => toggleDepartment(department.id, checked)}
                        />
                        <span className="min-w-0 flex-1 text-sm text-foreground">{department.name}</span>
                      </label>
                    );
                  })
                ) : (
                  <p className="px-3 py-4 text-sm text-muted-foreground">ยังไม่มีข้อมูลแผนก</p>
                )}
              </div>
            </fieldset>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p
            id="social-security-export-status"
            className={cn("max-w-2xl text-xs leading-5", exportError ? "text-status-danger" : "text-muted-foreground")}
            role={exportError ? "alert" : "status"}
          >
            {exportHelp}
          </p>
          <Button
            type="button"
            size="lg"
            leadingIcon={RiFileChartLine}
            onClick={exportXlsx}
            disabled={exportDisabled}
            aria-describedby="social-security-export-status"
            className="w-full sm:w-auto"
          >
            {isExporting ? "กำลังสร้างไฟล์…" : documentType === ".xlsx" ? "ส่งออก Excel" : "ส่งออก PDF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
