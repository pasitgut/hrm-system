"use client";

import { useMemo, useRef, useState } from "react";
import {
  RiFileExcel2Line,
  RiFilePdf2Line,
  RiFileSearchLine,
  RiInformationLine,
  RiUpload2Line,
} from "@remixicon/react";
import { PageHeader, SectionHeading } from "@/components/hrm/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions";

const SAFE_BATCH_BYTES = 3.5 * 1024 * 1024;
const MAX_SINGLE_WORKBOOK_BYTES = 4 * 1024 * 1024;
const PREVIEW_ROW_LIMIT = 50;

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: new Intl.DateTimeFormat("th-TH", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, index, 1))),
}));

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

export default function PayrollModule({ permissions = [] }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
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
  const canExport = hasPermission(permissions, "salary_slips.export");
  const years = useMemo(() => Array.from({ length: 8 }, (_, index) => now.getFullYear() - index), []);

  function resetFeedback() {
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
    resetFeedback();
    try {
      const rows = await parseFilesInBatches(slipFiles, setSlipProgress);
      setPreviewRows(rows);
      setSlipNotice(`ตรวจสอบไฟล์สำเร็จ: อ่านข้อมูลทั้งหมด ${rows.length} แถว`);
    } catch (parseError) {
      setPreviewRows(null);
      setSlipError(parseError instanceof Error ? parseError.message : "อ่านไฟล์ Excel ไม่สำเร็จ");
    } finally {
      setPreviewing(false);
      setSlipProgress("");
    }
  }

  async function generateSalarySlips(format, acknowledgeMissing = false) {
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

      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      const monthSuffix = slipScope === "selected" ? `-${String(month).padStart(2, "0")}` : "";
      anchor.href = blobUrl;
      anchor.download = `salary-slips-${year}${monthSuffix}.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
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

  const busy = previewing || Boolean(slipExporting);

  return (
    <div className="hrm-page space-y-5">
      <PageHeader
        eyebrow="ข้อมูล · สลิปเงินเดือน"
        title="สลิปเงินเดือน"
        description="สร้างและส่งออกสลิปเงินเดือน (.pdf / .xlsx) จากไฟล์ Excel ที่นำเข้า พร้อมคำนวณยอดสะสมรายปี (YTD) อัตโนมัติ"
      />

      <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <RiInformationLine className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          โหมดปัจจุบันใช้<strong>ไฟล์ Excel เงินเดือนที่อัปโหลด</strong>เป็นแหล่งข้อมูลหลักในการออกสลิปโดยไม่บันทึกข้อมูลลงฐานข้อมูล ส่วนการเชื่อมกับระบบคำนวณเงินเดือนภายใน HRM ถูกวางแผนไว้ในเอกสารออกแบบสำหรับเฟสถัดไป
        </p>
      </div>

      <section aria-label="ออกสลิปเงินเดือนจากไฟล์ Excel" className="space-y-4 rounded-lg border border-border bg-card p-5">
        <SectionHeading
          title="อัปโหลดไฟล์ Excel เงินเดือน (.xlsx)"
          description="เลือกไฟล์รายเดือนตั้งแต่เดือนมกราคมจนถึงเดือนที่ต้องการออกสลิป ระบบจะรวมยอดเงินได้ ภาษี ประกันสังคม และกองทุนสำรองเลี้ยงชีพสะสมตั้งแต่ต้นปีให้อัตโนมัติ"
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid w-full gap-1.5 sm:w-44">
            <label htmlFor="payroll-month" className="text-sm font-medium text-foreground">เดือนที่จ่าย</label>
            <Select id="payroll-month" selectedKey={month} onSelectionChange={(value) => { setMonth(String(value)); setSlipMissing(null); }}>
              {MONTHS.map((item) => <SelectItem id={item.value} key={item.value}>{item.label}</SelectItem>)}
            </Select>
          </div>
          <div className="grid w-full gap-1.5 sm:w-36">
            <label htmlFor="payroll-year" className="text-sm font-medium text-foreground">ปี พ.ศ.</label>
            <Select id="payroll-year" selectedKey={year} onSelectionChange={(value) => { setYear(String(value)); setSlipMissing(null); }}>
              {years.map((value) => <SelectItem id={String(value)} key={value}>{value + 543}</SelectItem>)}
            </Select>
          </div>
          <div className="grid w-full gap-1.5 sm:w-56">
            <label htmlFor="slip-scope" className="text-sm font-medium text-foreground">ขอบเขตสลิปที่ออก</label>
            <Select id="slip-scope" selectedKey={slipScope} onSelectionChange={(value) => { setSlipScope(String(value)); setSlipMissing(null); }}>
              <SelectItem id="selected">เฉพาะเดือนที่เลือก ({MONTHS[Number(month) - 1]?.label})</SelectItem>
              <SelectItem id="all">ทุกเดือนที่มีในไฟล์ (ปี {Number(year) + 543})</SelectItem>
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
            disabled={busy}
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              setSlipFiles(selected);
              setPreviewRows(null);
              resetFeedback();
            }}
          />
          <Button
            type="button"
            variant="outline"
            leadingIcon={RiUpload2Line}
            disabled={busy}
            onClick={() => slipInputRef.current?.click()}
          >
            {slipFiles.length ? `เลือกไฟล์แล้ว ${slipFiles.length} ไฟล์` : "เลือกไฟล์ .xlsx"}
          </Button>
          {canExport ? (
            <Button
              type="button"
              variant="outline"
              leadingIcon={RiFileSearchLine}
              disabled={!slipFiles.length || busy}
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
                disabled={!slipFiles.length || busy}
                onClick={() => generateSalarySlips("pdf")}
              >
                {slipExporting === "pdf" ? "กำลังสร้าง PDF…" : "ออกสลิป PDF"}
              </Button>
              <Button
                type="button"
                variant="outline"
                leadingIcon={RiFileExcel2Line}
                disabled={!slipFiles.length || busy}
                onClick={() => generateSalarySlips("xlsx")}
              >
                {slipExporting === "xlsx" ? "กำลังสร้าง Excel…" : "ออกสลิป Excel"}
              </Button>
            </>
          ) : null}
          {slipFiles.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSlipFiles([]);
                setPreviewRows(null);
                resetFeedback();
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
              disabled={busy}
              onClick={() => generateSalarySlips(slipMissing.format, true)}
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

          <div className="overflow-x-auto rounded-md border border-border">
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
          </div>
        </section>
      ) : null}
    </div>
  );
}
