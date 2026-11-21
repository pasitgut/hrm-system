"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  RiAlertLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiFileExcel2Line,
  RiUpload2Line,
  RiUploadCloud2Line,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { PageHeader, SectionHeading } from "@/components/hrm/PageHeader";
import { EXPECTED_SHEETS, MAX_MIGRATION_FILE_BYTES } from "@/lib/migration/constants";
import { cn } from "@/lib/utils";

const VERCEL_SERVERLESS_WARNING_BYTES = 4 * 1024 * 1024;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function postMigration(file, mode, confirmReplace = false) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", mode);
  if (confirmReplace) {
    formData.append("confirmReplace", "true");
  }
  const response = await fetch("/api/migration/sheets", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

export default function DataMigrationModule() {
  const fileInputId = useId();
  const confirmId = useId();

  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  function handleFileChange(event) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    setError("");
    setPreview(null);
    setResult(null);
    setConfirmed(false);

    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setSelectedFile(null);
      setError("รองรับเฉพาะไฟล์ .xlsx ที่ส่งออกจาก Google Sheet เท่านั้น");
      return;
    }
    if (file.size <= 0) {
      setSelectedFile(null);
      setError("ไฟล์ว่างเปล่า กรุณาเลือกไฟล์ใหม่");
      return;
    }
    if (file.size > MAX_MIGRATION_FILE_BYTES) {
      setSelectedFile(null);
      setError("ไฟล์ต้องมีขนาดไม่เกิน 25 MB");
      return;
    }

    setSelectedFile(file);
  }

  async function handlePreview() {
    if (!selectedFile) return;
    setError("");
    setResult(null);
    setConfirmed(false);
    setPreviewing(true);
    try {
      const { ok, payload } = await postMigration(selectedFile, "preview");
      if (!ok) {
        setPreview(null);
        setError(payload.error || "ตรวจสอบไฟล์ไม่สำเร็จ");
        return;
      }
      setPreview(payload);
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อตรวจสอบไฟล์ได้");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirmImport() {
    if (!selectedFile || !preview || preview.errors?.length > 0 || !confirmed) return;
    setError("");
    setImporting(true);
    try {
      const { ok, payload } = await postMigration(selectedFile, "import", true);
      setConfirmOpen(false);
      if (!ok) {
        if (Array.isArray(payload.errors) && payload.errors.length > 0) {
          setPreview((current) => (current ? { ...current, errors: payload.errors } : current));
        }
        setError(payload.error || "นำเข้าข้อมูลไม่สำเร็จ");
        return;
      }
      setResult(payload);
      setConfirmed(false);
    } catch {
      setConfirmOpen(false);
      setError("เกิดข้อผิดพลาดระหว่างบันทึกข้อมูลลงฐานข้อมูล");
    } finally {
      setImporting(false);
    }
  }

  const blockingErrors = preview?.errors ?? [];
  const warnings = preview?.warnings ?? result?.warnings ?? [];
  const summary = preview?.summary;

  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow="ระบบ · นำเข้าข้อมูล"
        title="นำเข้าข้อมูลจาก Google Sheet"
        description="อัปโหลดไฟล์ .xlsx ที่ส่งออกจาก Google Sheet เพื่อตรวจสอบและบันทึกข้อมูลทับใหม่ทั้งหมด (พนักงาน, ยืมทรัพย์สิน/Agreement, OT, วันลา และ Tracking Work)"
      />

      <section aria-labelledby="guide-heading" className="rounded-lg border border-border bg-card p-5">
        <SectionHeading
          id="guide-heading"
          title="ขั้นตอนการเตรียมไฟล์จาก Google Sheet"
          description="ใช้ไฟล์ Excel (.xlsx) ที่ส่งออกจาก Google Sheet ต้นฉบับของ AppSheet โดยคงชื่อแท็บและคอลัมน์ตามโครงสร้างเดิมทั้ง 5 แท็บ"
        />
        <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <li className="rounded-md border border-border bg-muted/40 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">ขั้นที่ 1 · ส่งออกไฟล์</span>
            <p className="mt-1 font-medium text-foreground">ดาวน์โหลดเป็น Microsoft Excel (.xlsx)</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              ใน Google Sheet ไปที่ <strong>File → Download → Microsoft Excel (.xlsx)</strong>
            </p>
          </li>
          <li className="rounded-md border border-border bg-muted/40 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">ขั้นที่ 2 · ตรวจชื่อแท็บ (5 แท็บ)</span>
            <p className="mt-1 font-medium text-foreground">ต้องมีแท็บ “ข้อมูลพนักงาน”</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              แท็บที่รองรับ: {EXPECTED_SHEETS.join(", ")}
            </p>
          </li>
          <li className="rounded-md border border-border bg-muted/40 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">ขั้นที่ 3 · ตรวจสอบก่อนทับ</span>
            <p className="mt-1 font-medium text-foreground">กู้คืนค่าผิดรูปและสรุปยอดก่อนเขียนทับ</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              นำเข้า Agreement + ลายเซ็น และแก้เลขที่บ้านที่ Excel แปลงเป็นวันที่ให้โดยอัตโนมัติ
            </p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="upload-heading" className="rounded-lg border border-border bg-card p-5 space-y-4">
        <SectionHeading
          id="upload-heading"
          title="อัปโหลดไฟล์ .xlsx"
          description="เลือกไฟล์จาก Google Sheet เพื่อตรวจสอบโครงสร้างและจำนวนรายการทั้ง 5 ตาราง"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label
            htmlFor={fileInputId}
            className={cn(
              "flex min-h-12 flex-1 cursor-pointer items-center gap-3 rounded-md border border-dashed border-input bg-muted/30 px-4 py-3 text-sm transition-colors hover:bg-muted/60 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
              (previewing || importing) && "pointer-events-none opacity-60",
            )}
          >
            <RiFileExcel2Line className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {selectedFile ? (
                <p className="truncate font-medium text-foreground">
                  {selectedFile.name}{" "}
                  <span className="font-normal text-muted-foreground">({formatBytes(selectedFile.size)})</span>
                </p>
              ) : (
                <p className="text-muted-foreground">คลิกเพื่อเลือกไฟล์ Google Sheet (.xlsx) ขนาดไม่เกิน 25 MB</p>
              )}
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground">
              <RiUpload2Line className="size-3.5" aria-hidden="true" />
              เลือกไฟล์
            </span>
            <input
              id={fileInputId}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={previewing || importing}
              onChange={handleFileChange}
            />
          </label>

          <Button
            type="button"
            leadingIcon={RiUploadCloud2Line}
            disabled={!selectedFile || previewing || importing}
            onClick={handlePreview}
          >
            {previewing ? "กำลังตรวจสอบไฟล์..." : "ตรวจสอบไฟล์"}
          </Button>
        </div>

        {selectedFile && selectedFile.size > VERCEL_SERVERLESS_WARNING_BYTES ? (
          <p className="rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs leading-5 text-foreground">
            ไฟล์มีขนาด {formatBytes(selectedFile.size)} (เกิน 4 MB) หาก Deploy บน Vercel Serverless Function ปกติอาจติดขีดจำกัด 4.5 MB แต่หากใช้งานผ่าน Container / Node Server จะรองรับได้ถึง 25 MB
          </p>
        ) : null}

        {error ? (
          <div role="alert" className="flex items-start gap-2.5 rounded-md border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
            <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
      </section>

      {preview && summary ? (
        <section aria-labelledby="preview-heading" className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionHeading
              id="preview-heading"
              title="ผลการตรวจสอบก่อนนำเข้า"
              description={`ไฟล์: ${preview.fileName}`}
            />
            <div className="flex flex-wrap gap-1.5">
              {preview.sheetsFound.map((sheet) => (
                <Badge key={sheet} variant="caption" className="border-status-success/30 bg-status-success/10 text-status-success">
                  พบแท็บ: {sheet}
                </Badge>
              ))}
              {preview.sheetsMissing.map((sheet) => (
                <Badge key={sheet} variant="caption" className="border-status-warning/30 bg-status-warning/10 text-status-warning">
                  ไม่พบแท็บ: {sheet}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-background sm:grid-cols-3 lg:grid-cols-6">
            <div className="border-b border-r border-border px-4 py-3 lg:border-b-0">
              <p className="text-xs text-muted-foreground">พนักงานทั้งหมด</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.employeesTotal}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                ปฏิบัติงาน {summary.employeesActive} · พ้นสภาพ {summary.employeesFormerStubs}
              </p>
            </div>
            <div className="border-b border-border px-4 py-3 sm:border-r lg:border-b-0">
              <p className="text-xs text-muted-foreground">แผนก / ตำแหน่ง</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.departments} <span className="text-sm font-normal text-muted-foreground">/</span> {summary.positions}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">สร้างอัตโนมัติตามข้อมูลในชีต</p>
            </div>
            <div className="border-b border-r border-border px-4 py-3 lg:border-b-0">
              <p className="text-xs text-muted-foreground">คำขอ OT</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.overtimeRequests}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">รายการหลังตัดข้อมูลซ้ำ</p>
            </div>
            <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
              <p className="text-xs text-muted-foreground">คำขอลา</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.leaveRequests}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">รายการหลังตัดข้อมูลซ้ำ</p>
            </div>
            <div className="border-r border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">ยืมทรัพย์สิน</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.assetRequests}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {summary.assetItems} ชิ้น · {summary.assetAgreements} สัญญา · {summary.assetAgreementSigners} ลายเซ็น
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground">ข้อมูลงาน (Tracking)</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.workTrackingRecords}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {summary.hasWorkSheet ? "นำเข้าทับ work_tracking_records" : "ไม่พบแท็บ — คงข้อมูลเดิมไว้"}
              </p>
            </div>
          </div>

          {blockingErrors.length > 0 ? (
            <div role="alert" className="rounded-md border border-status-danger/30 bg-status-danger/10 p-4 space-y-2">
              <div className="flex items-center gap-2 font-medium text-sm text-status-danger">
                <RiErrorWarningLine className="size-4 shrink-0" aria-hidden="true" />
                พบข้อผิดพลาดที่ต้องแก้ไขในไฟล์ ({blockingErrors.length} รายการ)
              </div>
              <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-xs leading-5 text-foreground">
                {blockingErrors.map((item, idx) => (
                  <li key={`${idx}-${item}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <details className="rounded-md border border-status-warning/30 bg-status-warning/10 p-4" open={warnings.length <= 8}>
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                <RiAlertLine className="size-4 shrink-0 text-status-warning" aria-hidden="true" />
                คำเตือนระหว่างการอ่านไฟล์ ({warnings.length} รายการ)
              </summary>
              <ul className="mt-3 max-h-56 list-disc space-y-1 overflow-y-auto pl-5 text-xs leading-5 text-muted-foreground">
                {warnings.map((item, idx) => (
                  <li key={`${idx}-${item}`}>{item}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="rounded-md border border-status-danger/30 bg-status-danger/5 p-4 space-y-3">
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-status-danger">คำเตือน: การนำเข้านี้จะลบข้อมูลเดิมทั้งหมดแล้วบันทึกข้อมูลใหม่ทับลงฐานข้อมูล</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs leading-5 text-muted-foreground">
                <li>
                  <strong>ข้อมูลที่ถูกลบและเขียนทับใหม่ทั้งหมด:</strong> พนักงาน, บัญชีผู้ใช้ในฐานข้อมูล (<code>users</code>), เอกสารพนักงาน, คำขอ OT, คำขอลา, คำขอยืมทรัพย์สิน (รวมสัญญา Agreement, ลายเซ็น และรูปแนบ), แผนก, ตำแหน่ง{summary.hasWorkSheet ? <> และข้อมูลงาน (<code>work_tracking_records</code>)</> : null}
                </li>
                <li>
                  <strong>ข้อมูลที่ยังคงเก็บไว้ตามเดิม:</strong> บัญชีผู้ดูแลระบบกลาง (<code>admin</code>), แม่แบบข้อตกลงทรัพย์สิน, ประวัติ Webhook/กิจกรรม LINE, ประเภทการลา และค่าเรท OT กลาง{!summary.hasWorkSheet ? <> (รวมถึง <code>work_tracking_records</code> เดิมเนื่องจากไฟล์ไม่มีแท็บ “ข้อมูลงาน”)</> : null}
                </li>
                <li>
                  <strong>รูปภาพและลายเซ็นจาก ImgBB:</strong> ระบบจะย้ายมาเก็บใน Cloudinary อัตโนมัติเมื่อเปิดใช้งาน หรือสั่งย้ายทั้งหมดล่วงหน้าผ่าน <code>npm run db:migrate-imgbb-cloudinary</code>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <label htmlFor={confirmId} className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-foreground">
                <Checkbox
                  id={confirmId}
                  isSelected={confirmed}
                  onChange={setConfirmed}
                  isDisabled={importing || blockingErrors.length > 0}
                />
                <span>ฉันเข้าใจและยืนยันว่าจะลบข้อมูลเดิมทั้งหมดแล้วบันทึกข้อมูลจากไฟล์นี้ทับใหม่</span>
              </label>

              <Button
                type="button"
                variant="danger"
                leadingIcon={RiUploadCloud2Line}
                disabled={!confirmed || importing || blockingErrors.length > 0}
                onClick={() => setConfirmOpen(true)}
              >
                {importing ? "กำลังบันทึกทับข้อมูล..." : "อัปโหลดและบันทึกทับข้อมูลทั้งหมด"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {result?.imported ? (
        <section aria-live="polite" className="rounded-lg border border-status-success/30 bg-status-success/10 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <RiCheckboxCircleLine className="mt-0.5 size-5 shrink-0 text-status-success" aria-hidden="true" />
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">นำเข้าข้อมูลทับฐานข้อมูลเรียบร้อยแล้ว</h2>
              <p className="text-xs text-muted-foreground">
                ไฟล์ {result.fileName} — บันทึกพนักงาน {result.imported.employeesTotal} คน, แผนก {result.imported.departments}, ตำแหน่ง {result.imported.positions}, OT {result.imported.overtimeRequests} รายการ, วันลา {result.imported.leaveRequests} รายการ, ยืมทรัพย์สิน {result.imported.assetRequests} รายการ (Agreement {result.imported.assetAgreements} ฉบับ / ลายเซ็น {result.imported.assetAgreementSigners} จุด){result.imported.hasWorkSheet ? ` และข้อมูลงาน ${result.imported.workTrackingRecords} รายการ` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link href="/employees">ดูทะเบียนพนักงาน</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/ot">ดูรายการ OT</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/leave">ดูรายการวันลา</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/assets">ดูรายการทรัพย์สิน</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/work-tracking">ดูระบบติดตามงาน</Link></Button>
          </div>
        </section>
      ) : null}

      <HrmDialog
        open={confirmOpen}
        onClose={() => { if (!importing) setConfirmOpen(false); }}
        title="ยืนยันการบันทึกข้อมูลทับใหม่ทั้งหมด"
        description="การดำเนินการนี้ไม่สามารถย้อนกลับได้ ข้อมูลพนักงาน คำขอ ยืมทรัพย์สิน/Agreement และประวัติที่เลือกไว้ในฐานข้อมูลจะถูกแทนที่ด้วยไฟล์ใหม่"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={importing} onClick={() => setConfirmOpen(false)}>
              ยกเลิก
            </Button>
            <Button type="button" variant="danger" disabled={importing} onClick={handleConfirmImport}>
              {importing ? "กำลังบันทึกข้อมูล..." : "ยืนยันบันทึกทับทั้งหมด"}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 py-2 text-sm text-muted-foreground">
          <p>ไฟล์ที่เลือก: <strong className="text-foreground">{selectedFile?.name}</strong></p>
          {summary ? (
            <p>
              กำลังจะบันทึก: พนักงาน <strong className="text-foreground">{summary.employeesTotal}</strong> คน, คำขอ OT{" "}
              <strong className="text-foreground">{summary.overtimeRequests}</strong> รายการ, คำขอลา{" "}
              <strong className="text-foreground">{summary.leaveRequests}</strong> รายการ, ยืมทรัพย์สิน{" "}
              <strong className="text-foreground">{summary.assetRequests}</strong> รายการ (Agreement{" "}
              <strong className="text-foreground">{summary.assetAgreements}</strong> ฉบับ / ลายเซ็น{" "}
              <strong className="text-foreground">{summary.assetAgreementSigners}</strong> จุด)
              {summary.hasWorkSheet ? (
                <>
                  {" "}และข้อมูลงาน <strong className="text-foreground">{summary.workTrackingRecords}</strong> รายการ
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </HrmDialog>
    </div>
  );
}
