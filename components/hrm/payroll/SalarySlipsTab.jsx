"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  RiFileExcel2Line,
  RiFilePdf2Line,
  RiFileSearchLine,
  RiInformationLine,
  RiSearchLine,
  RiUpload2Line,
} from "@remixicon/react";
import { SectionHeading } from "@/components/hrm/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { formatMoney, getShortMonthLabel, THAI_MONTH_OPTIONS, toBuddhistYear } from "./payrollFormat";

const SAFE_BATCH_BYTES = 3.5 * 1024 * 1024;
const MAX_SINGLE_WORKBOOK_BYTES = 4 * 1024 * 1024;
const PREVIEW_ROW_LIMIT = 50;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatBahtFromSatang(satang) {
  if (typeof satang !== "number" || !Number.isFinite(satang)) return "—";
  return `${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
}

function buildWorkbookBatches(files) {
  const oversized = files.find((file) => file.size > MAX_SINGLE_WORKBOOK_BYTES);
  if (oversized) {
    throw new Error(`ไฟล์ ${oversized.name} มีขนาดเกิน 4 MB กรุณาแบ่งแยกไฟล์รายเดือนก่อนอัปโหลด`);
  }

  const batches = [];
  let currentBatch = [];
  let currentBytes = 0;
  for (const file of files) {
    if (currentBatch.length > 0 && currentBytes + file.size > SAFE_BATCH_BYTES) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBytes = 0;
    }
    currentBatch.push(file);
    currentBytes += file.size;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

async function parseFilesInBatches(files, onProgress) {
  const batches = buildWorkbookBatches(files);
  const combinedRows = [];
  for (let index = 0; index < batches.length; index += 1) {
    onProgress?.(`กำลังอ่านไฟล์ชุดที่ ${index + 1}/${batches.length}…`);
    const batchForm = new FormData();
    for (const file of batches[index]) batchForm.append("files", file);
    const parseResponse = await fetch("/api/salary-slips/parse", {
      method: "POST",
      body: batchForm,
    });
    const parsePayload = await parseResponse.json().catch(() => ({}));
    if (!parseResponse.ok) {
      throw new Error(parsePayload.error || "อ่านไฟล์ Excel ไม่สำเร็จ");
    }
    combinedRows.push(...(parsePayload.rows ?? []));
  }
  return combinedRows;
}

function triggerBlobDownload(blob, filename) {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export function SalarySlipsTab({
  year,
  month,
  payroll,
  loadingPayroll = false,
  permissions = [],
}) {
  const canExport = hasPermission(permissions, "salary_slips.export");
  const [sourceMode, setSourceMode] = useState("hrm");

  // HRM-linked slip state
  const [hrmSearch, setHrmSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);
  const [hrmExporting, setHrmExporting] = useState("");
  const [hrmError, setHrmError] = useState("");
  const [hrmNotice, setHrmNotice] = useState("");

  // Excel upload fallback state
  const [slipFiles, setSlipFiles] = useState([]);
  const [slipScope, setSlipScope] = useState("selected");
  const [previewRows, setPreviewRows] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [slipExporting, setSlipExporting] = useState("");
  const [slipProgress, setSlipProgress] = useState("");
  const [slipError, setSlipError] = useState("");
  const [slipNotice, setSlipNotice] = useState("");
  const [slipMissing, setSlipMissing] = useState(null);
  const slipInputRef = useRef(null);

  const rows = payroll?.rows ?? [];
  const departments = useMemo(
    () => [...new Set(rows.map((row) => row.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th-TH")),
    [rows],
  );

  useEffect(() => {
    const readyPrintableIds = rows
      .filter((row) => row.netPay != null && !row.doNotPrintPayslip)
      .map((row) => row.employeeId);
    setSelectedIds(readyPrintableIds);
    setHrmError("");
    setHrmNotice("");
  }, [payroll?.year, payroll?.month, rows.length]);

  const filteredHrmRows = useMemo(() => {
    const keyword = hrmSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (departmentFilter !== "all" && row.department !== departmentFilter) return false;
      if (!keyword) return true;
      return (
        row.name.toLowerCase().includes(keyword)
        || row.code.toLowerCase().includes(keyword)
        || row.department.toLowerCase().includes(keyword)
      );
    });
  }, [rows, departmentFilter, hrmSearch]);

  const selectableVisibleIds = useMemo(
    () => filteredHrmRows.filter((row) => row.netPay != null).map((row) => row.employeeId),
    [filteredHrmRows],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = selectableVisibleIds.length > 0
    && selectableVisibleIds.every((id) => selectedSet.has(id));

  function toggleAllVisible(checked) {
    if (checked) {
      const merged = new Set([...selectedIds, ...selectableVisibleIds]);
      setSelectedIds([...merged]);
    } else {
      const visibleSet = new Set(selectableVisibleIds);
      setSelectedIds(selectedIds.filter((id) => !visibleSet.has(id)));
    }
  }

  function toggleOne(employeeId, checked) {
    if (checked) {
      setSelectedIds((prev) => (prev.includes(employeeId) ? prev : [...prev, employeeId]));
    } else {
      setSelectedIds((prev) => prev.filter((id) => id !== employeeId));
    }
  }

  async function generateHrmSlips(format, employeeIds = selectedIds) {
    if (!employeeIds.length) {
      setHrmError("กรุณาเลือกพนักงานอย่างน้อย 1 คนเพื่อออกสลิปเงินเดือน");
      return;
    }
    setHrmExporting(format);
    setHrmError("");
    setHrmNotice("");
    try {
      const response = await fetch("/api/payroll/slips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          format,
          employeeIds,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "ออกสลิปเงินเดือนจากระบบ HRM ไม่สำเร็จ");
      }
      const periodSlug = `${year}-${String(month).padStart(2, "0")}`;
      triggerBlobDownload(await response.blob(), `hrm-salary-slips-${periodSlug}.${format}`);
      setHrmNotice(`สร้างสลิปเงินเดือนจากข้อมูลระบบ HRM (${employeeIds.length} คน · .${format}) แล้ว`);
    } catch (exportError) {
      setHrmError(exportError instanceof Error ? exportError.message : "ออกสลิปเงินเดือนไม่สำเร็จ");
    } finally {
      setHrmExporting("");
    }
  }

  function resetExcelFeedback() {
    setSlipError("");
    setSlipNotice("");
    setSlipMissing(null);
  }

  async function previewSalarySlips() {
    if (!slipFiles.length) {
      setSlipError("กรุณาเลือกไฟล์ Excel (.xlsx) อย่างน้อย 1 ไฟล์");
      return;
    }
    setPreviewing(true);
    setSlipProgress("");
    resetExcelFeedback();
    try {
      const parsed = await parseFilesInBatches(slipFiles, setSlipProgress);
      setPreviewRows(parsed);
      setSlipNotice(`ตรวจสอบไฟล์สำเร็จ: อ่านข้อมูลทั้งหมด ${parsed.length} แถว`);
    } catch (parseError) {
      setPreviewRows(null);
      setSlipError(parseError instanceof Error ? parseError.message : "อ่านไฟล์ Excel ไม่สำเร็จ");
    } finally {
      setPreviewing(false);
      setSlipProgress("");
    }
  }

  async function generateExcelSlips(format, acknowledgeMissing = false) {
    if (!slipFiles.length) {
      setSlipError("กรุณาเลือกไฟล์ Excel (.xlsx) อย่างน้อย 1 ไฟล์");
      return;
    }
    setSlipExporting(format);
    setSlipProgress("");
    setSlipError("");
    setSlipNotice("");
    if (!acknowledgeMissing) setSlipMissing(null);

    try {
      const totalBytes = slipFiles.reduce((sum, file) => sum + file.size, 0);
      let response;

      if (previewRows && previewRows.length > 0) {
        setSlipProgress("กำลังสร้างไฟล์สลิป…");
        response = await fetch("/api/salary-slips/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            format,
            year: Number(year),
            ...(slipScope === "selected" ? { month: Number(month) } : {}),
            acknowledgeMissing,
            rows: previewRows,
          }),
        });
      } else if (totalBytes <= SAFE_BATCH_BYTES) {
        const form = new FormData();
        for (const file of slipFiles) form.append("files", file);
        form.append("format", format);
        form.append("year", year);
        if (slipScope === "selected") form.append("month", month);
        if (acknowledgeMissing) form.append("acknowledgeMissing", "true");

        response = await fetch("/api/salary-slips/export", {
          method: "POST",
          body: form,
        });
      } else {
        const combinedRows = await parseFilesInBatches(slipFiles, setSlipProgress);
        setPreviewRows(combinedRows);
        setSlipProgress("กำลังสร้างไฟล์สลิป…");
        response = await fetch("/api/salary-slips/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            format,
            year: Number(year),
            ...(slipScope === "selected" ? { month: Number(month) } : {}),
            acknowledgeMissing,
            rows: combinedRows,
          }),
        });
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (response.status === 409 && Array.isArray(payload.missing)) {
          setSlipMissing({ format, message: payload.error, items: payload.missing });
          return;
        }
        throw new Error(payload.error || "ออกสลิปเงินเดือนไม่สำเร็จ");
      }

      const monthSuffix = slipScope === "selected" ? `-${String(month).padStart(2, "0")}` : "";
      triggerBlobDownload(await response.blob(), `salary-slips-${year}${monthSuffix}.${format}`);
      setSlipMissing(null);
      setSlipNotice(`สร้างไฟล์สลิปเงินเดือน (.${format}) และเริ่มดาวน์โหลดแล้ว`);
    } catch (exportError) {
      setSlipError(exportError instanceof Error ? exportError.message : "ออกสลิปเงินเดือนไม่สำเร็จ");
    } finally {
      setSlipExporting("");
      setSlipProgress("");
    }
  }

  const previewSummary = useMemo(() => {
    if (!previewRows) return null;
    const valid = previewRows.filter((row) => row.data && row.errors.length === 0);
    const employeeCodes = new Set(valid.map((row) => row.data.code));
    const monthsFound = [...new Set(valid.map((row) => `${row.data.month}/${row.data.year + 543}`))];
    const issueCount = previewRows.filter((row) => row.errors.length > 0 || row.warnings.length > 0).length;
    return {
      totalRows: previewRows.length,
      validRows: valid.length,
      employeeCount: employeeCodes.size,
      monthsFound,
      issueCount,
      sampleRows: previewRows.slice(0, PREVIEW_ROW_LIMIT),
    };
  }, [previewRows]);

  const excelBusy = previewing || Boolean(slipExporting);
  const hrmBusy = Boolean(hrmExporting);
  const isLocked = payroll?.workflow?.status === "locked" || payroll?.workflow?.status === "paid";
  const periodDisplay = `${getShortMonthLabel(month)} ${toBuddhistYear(year)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="เลือกแหล่งข้อมูลสำหรับออกสลิปเงินเดือน"
          className="inline-flex rounded-md border border-border bg-muted/50 p-1"
        >
          <button
            type="button"
            onClick={() => setSourceMode("hrm")}
            aria-pressed={sourceMode === "hrm"}
            className={cn(
              "rounded-sm px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              sourceMode === "hrm"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            จากข้อมูลระบบ HRM
          </button>
          <button
            type="button"
            onClick={() => setSourceMode("excel")}
            aria-pressed={sourceMode === "excel"}
            className={cn(
              "rounded-sm px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              sourceMode === "excel"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            นำเข้าไฟล์ Excel (.xlsx)
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          งวดที่เลือก: <strong className="text-foreground">{periodDisplay}</strong>
        </p>
      </div>

      {sourceMode === "hrm" ? (
        <Card className="space-y-4 p-5">
          <SectionHeading
            title={`ออกสลิปเงินเดือนจากข้อมูลระบบ HRM — งวด ${periodDisplay}`}
            description={`เชื่อมโยงข้อมูลฐานเงินเดือน ค่า OT ที่อนุมัติแล้ว และรายการรับ-หักประจำจากระบบ HRM พร้อมคำนวณยอดสะสมรายปี (ม.ค.–${getShortMonthLabel(month)} ${toBuddhistYear(year)}) อัตโนมัติ`}
          />

          <div
            className={cn(
              "flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-xs leading-5",
              isLocked
                ? "border-status-success/30 bg-status-success/10 text-foreground"
                : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            <RiInformationLine
              className={cn("mt-0.5 size-4 shrink-0", isLocked ? "text-status-success" : "text-primary")}
              aria-hidden="true"
            />
            <p>
              {isLocked
                ? "งวดเงินเดือนนี้ผ่านการอนุมัติและล็อกยอดแล้ว ข้อมูลบนสลิปตรงกับ Snapshot ประจำงวด"
                : "งวดเงินเดือนนี้ยังไม่ได้ล็อกงวด สามารถออกสลิปตัวอย่าง (.pdf / .xlsx) จากข้อมูลคำนวณสดในระบบ HRM ได้ทันที"}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-full sm:w-56">
                <Input
                  aria-label="ค้นหาพนักงานสำหรับออกสลิป"
                  leadingIcon={RiSearchLine}
                  placeholder="ค้นหารหัส หรือชื่อพนักงาน…"
                  value={hrmSearch}
                  onChange={setHrmSearch}
                  className="[&_input]:h-9 [&_input]:text-xs"
                />
              </div>
              <div className="w-full sm:w-44">
                <Select
                  aria-label="กรองตามแผนก"
                  size="sm"
                  selectedKey={departmentFilter}
                  onSelectionChange={(value) => setDepartmentFilter(String(value))}
                >
                  <SelectItem id="all">ทุกแผนก</SelectItem>
                  {departments.map((department) => (
                    <SelectItem id={department} key={department}>
                      {department}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            </div>

            {canExport ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  leadingIcon={RiFilePdf2Line}
                  disabled={loadingPayroll || hrmBusy || selectedIds.length === 0}
                  onClick={() => generateHrmSlips("pdf")}
                >
                  {hrmExporting === "pdf" ? "กำลังสร้าง PDF…" : `ออกสลิป PDF (${selectedIds.length})`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  leadingIcon={RiFileExcel2Line}
                  disabled={loadingPayroll || hrmBusy || selectedIds.length === 0}
                  onClick={() => generateHrmSlips("xlsx")}
                >
                  {hrmExporting === "xlsx" ? "กำลังสร้าง Excel…" : `ออกสลิป Excel (${selectedIds.length})`}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">บัญชีนี้ไม่มีสิทธิ์ส่งออกสลิปเงินเดือน</p>
            )}
          </div>

          {hrmError ? <p role="alert" className="text-sm text-status-danger">{hrmError}</p> : null}
          {hrmNotice ? <p role="status" className="text-sm text-status-success">{hrmNotice}</p> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="เลือกพนักงานทั้งหมดที่พร้อมออกสลิป"
                    isSelected={allVisibleSelected}
                    isDisabled={selectableVisibleIds.length === 0}
                    onChange={(checked) => toggleAllVisible(Boolean(checked))}
                  />
                </TableHead>
                <TableHead>พนักงาน</TableHead>
                <TableHead>ธนาคาร / เลขบัญชี</TableHead>
                <TableHead className="text-right">รายได้รวม</TableHead>
                <TableHead className="text-right">รายหักรวม</TableHead>
                <TableHead className="text-right">รับสุทธิ</TableHead>
                <TableHead>สถานะสลิป</TableHead>
                <TableHead className="text-right">ดาวน์โหลดรายคน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingPayroll ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    กำลังโหลดรายชื่อพนักงานจากระบบ HRM…
                  </TableCell>
                </TableRow>
              ) : filteredHrmRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    ไม่พบรายการพนักงานในงวดนี้
                  </TableCell>
                </TableRow>
              ) : (
                filteredHrmRows.map((row) => {
                  const isReady = row.netPay != null;
                  const isChecked = selectedSet.has(row.employeeId);
                  return (
                    <TableRow key={row.employeeId}>
                      <TableCell>
                        <Checkbox
                          aria-label={`เลือก ${row.name}`}
                          isSelected={isChecked}
                          isDisabled={!isReady}
                          onChange={(checked) => toggleOne(row.employeeId, Boolean(checked))}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium text-foreground">{row.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {row.code} · {row.department || "ไม่ระบุแผนก"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.bankName || row.bankAccount
                          ? `${row.bankName || "—"} · ${row.bankAccount || "—"}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.incomeTotal)}</TableCell>
                      <TableCell className="text-right tabular-nums text-status-danger">{formatMoney(row.deductionTotal)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatMoney(row.netPay)}</TableCell>
                      <TableCell>
                        {!isReady ? (
                          <Badge color="danger" variant="caption">ข้อมูลไม่ครบ</Badge>
                        ) : row.doNotPrintPayslip ? (
                          <Badge color="neutral" variant="caption">งดพิมพ์สลิป</Badge>
                        ) : (
                          <Badge color="success" variant="caption">พร้อมออกสลิป</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={!canExport || !isReady || hrmBusy}
                            onClick={() => generateHrmSlips("pdf", [row.employeeId])}
                          >
                            PDF
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={!canExport || !isReady || hrmBusy}
                            onClick={() => generateHrmSlips("xlsx", [row.employeeId])}
                          >
                            Excel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <>
          <section aria-label="ออกสลิปเงินเดือนจากไฟล์ Excel" className="space-y-4 rounded-lg border border-border bg-card p-5">
            <SectionHeading
              title="อัปโหลดไฟล์ Excel เงินเดือน (.xlsx)"
              description="เลือกไฟล์รายเดือนตั้งแต่เดือนมกราคมจนถึงเดือนที่ต้องการออกสลิป ระบบจะรวมยอดเงินได้ ภาษี ประกันสังคม และกองทุนสำรองเลี้ยงชีพสะสมตั้งแต่ต้นปีให้อัตโนมัติ (ไม่บันทึกลงฐานข้อมูล)"
            />

            <div className="flex flex-wrap items-end gap-3">
              <div className="grid w-full gap-1.5 sm:w-56">
                <label htmlFor="slip-scope" className="text-sm font-medium text-foreground">ขอบเขตสลิปที่ออก</label>
                <Select id="slip-scope" selectedKey={slipScope} onSelectionChange={(value) => { setSlipScope(String(value)); setSlipMissing(null); }}>
                  <SelectItem id="selected">เฉพาะเดือนที่เลือก ({THAI_MONTH_OPTIONS[Number(month) - 1]?.label})</SelectItem>
                  <SelectItem id="all">ทุกเดือนที่มีในไฟล์ (ปี {toBuddhistYear(year)})</SelectItem>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <input
                ref={slipInputRef}
                type="file"
                accept=".xlsx"
                multiple
                className="sr-only"
                disabled={excelBusy}
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []);
                  setSlipFiles(selected);
                  setPreviewRows(null);
                  resetExcelFeedback();
                }}
              />
              <Button
                type="button"
                variant="outline"
                leadingIcon={RiUpload2Line}
                disabled={excelBusy}
                onClick={() => slipInputRef.current?.click()}
              >
                {slipFiles.length ? `เลือกไฟล์แล้ว ${slipFiles.length} ไฟล์` : "เลือกไฟล์ .xlsx"}
              </Button>
              {canExport ? (
                <Button
                  type="button"
                  variant="outline"
                  leadingIcon={RiFileSearchLine}
                  disabled={!slipFiles.length || excelBusy}
                  onClick={previewSalarySlips}
                >
                  {previewing ? "กำลังตรวจสอบไฟล์…" : "ตรวจสอบไฟล์ก่อนออกสลิป"}
                </Button>
              ) : null}
              {canExport ? (
                <>
                  <Button
                    type="button"
                    leadingIcon={RiFilePdf2Line}
                    disabled={!slipFiles.length || excelBusy}
                    onClick={() => generateExcelSlips("pdf")}
                  >
                    {slipExporting === "pdf" ? "กำลังสร้าง PDF…" : "ออกสลิป PDF"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    leadingIcon={RiFileExcel2Line}
                    disabled={!slipFiles.length || excelBusy}
                    onClick={() => generateExcelSlips("xlsx")}
                  >
                    {slipExporting === "xlsx" ? "กำลังสร้าง Excel…" : "ออกสลิป Excel"}
                  </Button>
                </>
              ) : null}
              {slipFiles.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={excelBusy}
                  onClick={() => {
                    setSlipFiles([]);
                    setPreviewRows(null);
                    resetExcelFeedback();
                    if (slipInputRef.current) slipInputRef.current.value = "";
                  }}
                >
                  ล้างไฟล์
                </Button>
              ) : null}
            </div>

            {slipFiles.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {slipFiles.map((file) => (
                  <li key={`${file.name}-${file.size}`} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground">
                    <RiFileExcel2Line className="size-3.5 text-primary" aria-hidden="true" />
                    <span>{file.name}</span>
                    <span className="text-muted-foreground">({formatBytes(file.size)})</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {slipProgress ? <p role="status" className="text-xs text-muted-foreground">{slipProgress}</p> : null}
            {slipError ? <p role="alert" className="text-sm text-status-danger">{slipError}</p> : null}
            {slipNotice ? <p role="status" className="text-sm text-status-success">{slipNotice}</p> : null}

            {slipMissing ? (
              <div role="alert" className="space-y-2 rounded-md border border-status-warning/40 bg-status-warning/10 p-3 text-xs text-foreground">
                <p className="font-medium">{slipMissing.message}</p>
                <p className="text-muted-foreground">
                  พบพนักงานที่ขาดบางเดือนจำนวน {slipMissing.items.length} รายการ (เช่น {slipMissing.items.slice(0, 3).map((item) => `${item.name} ขาดเดือน ${item.missingMonths.join(", ")}`).join("; ")})
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={excelBusy}
                  onClick={() => generateExcelSlips(slipMissing.format, true)}
                >
                  ยืนยันออกสลิป (.{slipMissing.format}) ตามข้อมูลที่มีในไฟล์
                </Button>
              </div>
            ) : null}

            {!canExport ? (
              <p role="status" className="text-xs text-muted-foreground">บัญชีนี้ไม่มีสิทธิ์ส่งออกข้อมูลสลิปเงินเดือน</p>
            ) : null}
          </section>

          {previewSummary ? (
            <section aria-label="ผลตรวจสอบไฟล์ Excel เงินเดือน" className="space-y-4 rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionHeading
                  title="ผลตรวจสอบข้อมูลในไฟล์ Excel"
                  description={previewSummary.totalRows > PREVIEW_ROW_LIMIT ? `แสดงตัวอย่าง ${PREVIEW_ROW_LIMIT} จาก ${previewSummary.totalRows} แถว` : `ทั้งหมด ${previewSummary.totalRows} แถว`}
                />
                {previewSummary.monthsFound.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {previewSummary.monthsFound.map((period) => (
                      <Badge key={period} variant="caption">{period}</Badge>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-background sm:grid-cols-4">
                <div className="border-b border-r border-border px-4 py-3 sm:border-b-0">
                  <p className="text-xs text-muted-foreground">แถวที่นำเข้าได้</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{previewSummary.validRows}</p>
                </div>
                <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
                  <p className="text-xs text-muted-foreground">พนักงาน (คน)</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{previewSummary.employeeCount}</p>
                </div>
                <div className="border-r border-border px-4 py-3">
                  <p className="text-xs text-muted-foreground">จำนวนเดือนในไฟล์</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{previewSummary.monthsFound.length}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">แถวที่มีคำเตือน/ข้อผิดพลาด</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{previewSummary.issueCount}</p>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ไฟล์ / แถว</TableHead>
                    <TableHead>พนักงาน</TableHead>
                    <TableHead>งวด</TableHead>
                    <TableHead className="text-right">รายได้รวม</TableHead>
                    <TableHead className="text-right">รายหักรวม</TableHead>
                    <TableHead className="text-right">รับสุทธิ</TableHead>
                    <TableHead>หมายเหตุ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewSummary.sampleRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="text-xs text-muted-foreground">{row.file} · แถว {row.row}</TableCell>
                      <TableCell>
                        {row.data ? (
                          <div>
                            <span className="font-medium text-foreground">{row.data.name}</span>
                            <span className="block text-xs text-muted-foreground">{row.data.code} · {row.data.department || "—"}</span>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">{row.data ? `${row.data.month}/${row.data.year + 543}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.data ? formatBahtFromSatang(row.data.incomeTotal) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.data ? formatBahtFromSatang(row.data.deductionTotal) : "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{row.data ? formatBahtFromSatang(row.data.netPay) : "—"}</TableCell>
                      <TableCell className="text-xs">
                        {row.errors.length > 0 ? (
                          <span className="text-status-danger">{row.errors.join(", ")}</span>
                        ) : row.warnings.length > 0 ? (
                          <span className="text-status-warning">{row.warnings.join(", ")}</span>
                        ) : (
                          <span className="text-status-success">พร้อมออกสลิป</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
