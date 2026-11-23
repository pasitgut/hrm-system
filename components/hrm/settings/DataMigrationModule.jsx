"use client";

import { useId, useMemo, useState } from "react";
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
import {
  EXPECTED_SHEETS,
  MAX_MIGRATION_FILE_BYTES,
  MIGRATION_SECTIONS,
  SHEET_BY_SECTION,
} from "@/lib/migration/constants";
import { cn } from "@/lib/utils";

const VERCEL_SERVERLESS_WARNING_BYTES = 4 * 1024 * 1024;

const SECTION_META = {
  employees: {
    label: "ข้อมูลพนักงานและบัญชีผู้ใช้",
    sheet: SHEET_BY_SECTION.employees,
    modeText: "อัปเดตและเพิ่มใหม่ตามรหัสพนักงาน (เก็บรหัสผ่าน/สิทธิ์เดิม)",
    href: "/employees",
    linkLabel: "ดูทะเบียนพนักงาน",
    fileSummary: (s) => `ในไฟล์: ${s.employeesTotal} คน (ปฏิบัติงาน ${s.employeesActive} · พ้นสภาพ ${s.employeesFormerStubs})`,
    dbSummary: (c) => `ในระบบตอนนี้: ${c.employees} คน · ${c.users} บัญชี`,
    confirmSummary: (s) =>
      `ข้อมูลพนักงาน ${s.employeesTotal} คน (สร้างบัญชีใหม่เฉพาะคนที่ยังไม่มี ${s.usersProvisioned ?? 0} บัญชี)`,
  },
  overtime: {
    label: "คำขอ OT",
    sheet: SHEET_BY_SECTION.overtime,
    modeText: "เขียนทับข้อมูล OT ทั้งหมดด้วยไฟล์ใหม่",
    href: "/ot",
    linkLabel: "ดูรายการ OT",
    fileSummary: (s) => `ในไฟล์: ${s.overtimeRequests} รายการ`,
    dbSummary: (c) => `ในระบบตอนนี้: ${c.overtime} รายการ`,
    confirmSummary: (s) => `คำขอ OT ${s.overtimeRequests} รายการ`,
  },
  leave: {
    label: "คำขอวันลา",
    sheet: SHEET_BY_SECTION.leave,
    modeText: "เขียนทับข้อมูลวันลาทั้งหมดด้วยไฟล์ใหม่",
    href: "/leave",
    linkLabel: "ดูรายการวันลา",
    fileSummary: (s) => `ในไฟล์: ${s.leaveRequests} รายการ`,
    dbSummary: (c) => `ในระบบตอนนี้: ${c.leave} รายการ`,
    confirmSummary: (s) => `คำขอวันลา ${s.leaveRequests} รายการ`,
  },
  assets: {
    label: "การยืมทรัพย์สินและสัญญา",
    sheet: SHEET_BY_SECTION.assets,
    modeText: "เขียนทับคำขอยืมทรัพย์สินและ Agreement (เก็บแม่แบบเดิมไว้)",
    href: "/assets",
    linkLabel: "ดูรายการทรัพย์สิน",
    fileSummary: (s) => `ในไฟล์: ${s.assetRequests} รายการ (${s.assetAgreements} สัญญา)`,
    dbSummary: (c) => `ในระบบตอนนี้: ${c.assets} รายการ`,
    confirmSummary: (s) =>
      `ยืมทรัพย์สิน ${s.assetRequests} รายการ (Agreement ${s.assetAgreements} ฉบับ / ลายเซ็น ${s.assetAgreementSigners} จุด)`,
  },
  workTracking: {
    label: "ข้อมูลงาน (Work Tracking)",
    sheet: SHEET_BY_SECTION.workTracking,
    modeText: "เขียนทับข้อมูลงานใน work_tracking_records",
    href: "/work-tracking",
    linkLabel: "ดูระบบติดตามงาน",
    fileSummary: (s) => `ในไฟล์: ${s.workTrackingRecords} รายการ`,
    dbSummary: (c) => `ในระบบตอนนี้: ${c.workTracking} รายการ`,
    confirmSummary: (s) => `ข้อมูลงาน ${s.workTrackingRecords} รายการ`,
  },
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function postMigration(file, mode, { confirmReplace = false, sections = [] } = {}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", mode);
  if (confirmReplace) {
    formData.append("confirmReplace", "true");
  }
  for (const section of sections) {
    formData.append("sections", section);
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
  const sectionCheckboxPrefix = useId();

  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [selectedSections, setSelectedSections] = useState([]);
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
    setSelectedSections([]);
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
        setSelectedSections([]);
        setError(payload.error || "ตรวจสอบไฟล์ไม่สำเร็จ");
        return;
      }
      setPreview(payload);
      const available = Array.isArray(payload.availableSections) ? payload.availableSections : [];
      setSelectedSections(available.length === 1 ? [...available] : []);
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อตรวจสอบไฟล์ได้");
    } finally {
      setPreviewing(false);
    }
  }

  function toggleSection(section, checked) {
    setConfirmed(false);
    setError("");
    setSelectedSections((current) => {
      if (checked) {
        return MIGRATION_SECTIONS.filter((item) => item === section || current.includes(item));
      }
      return current.filter((item) => item !== section);
    });
  }

  function selectAllAvailable() {
    const available = preview?.availableSections ?? [];
    setSelectedSections(MIGRATION_SECTIONS.filter((section) => available.includes(section)));
    setConfirmed(false);
    setError("");
  }

  function clearSelectedSections() {
    setSelectedSections([]);
    setConfirmed(false);
    setError("");
  }

  const availableSections = useMemo(() => preview?.availableSections ?? [], [preview]);

  const activeBlockingErrors = useMemo(() => {
    if (!preview) return [];
    const next = [];
    if (selectedSections.includes("employees")) {
      next.push(...(preview.errors ?? []));
    } else {
      for (const section of ["overtime", "leave", "assets"]) {
        if (!selectedSections.includes(section)) continue;
        const missing = preview.missingDbEmployeeCodesBySection?.[section] ?? [];
        if (missing.length > 0) {
          next.push(
            `[${SECTION_META[section].label}] พบรหัสพนักงานที่ยังไม่มีในระบบปัจจุบัน: ${missing.join(", ")} — กรุณาเพิ่มพนักงานก่อน หรือเลือกนำเข้า “${SECTION_META.employees.label}” ร่วมด้วย`,
          );
        }
      }
    }
    return next;
  }, [preview, selectedSections]);

  async function handleConfirmImport() {
    if (!selectedFile || !preview || selectedSections.length === 0 || activeBlockingErrors.length > 0 || !confirmed) {
      return;
    }
    setError("");
    setImporting(true);
    try {
      const { ok, payload } = await postMigration(selectedFile, "import", {
        confirmReplace: true,
        sections: selectedSections,
      });
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

  const warnings = preview?.warnings ?? result?.warnings ?? [];
  const summary = preview?.summary;
  const dbCounts = preview?.existingDbCounts;
  const unselectedAvailable = availableSections.filter((s) => !selectedSections.includes(s));
  const hasDestructiveSelected = selectedSections.some((s) => s !== "employees");

  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow="ระบบ · นำเข้าข้อมูล"
        title="นำเข้าข้อมูลจาก Google Sheet"
        description="อัปโหลดไฟล์ .xlsx เพื่อเลือกนำเข้าเฉพาะส่วนที่ต้องการอัปเดต (เช่น เฉพาะ OT หรือเฉพาะวันลา) โดยคงข้อมูลส่วนอื่นที่ใช้งานอยู่ในระบบไว้ตามเดิม"
      />

      <section aria-labelledby="guide-heading" className="rounded-lg border border-border bg-card p-5">
        <SectionHeading
          id="guide-heading"
          title="ขั้นตอนการเตรียมไฟล์จาก Google Sheet"
          description="ใช้ไฟล์ Excel (.xlsx) ที่มีครบทั้ง 5 แท็บ หรือไฟล์ที่มีเฉพาะแท็บที่ต้องการนำเข้าก็ได้"
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
            <span className="text-xs font-medium text-muted-foreground">ขั้นที่ 2 · ใช้ได้ทั้งไฟล์เต็มหรือเฉพาะแท็บ</span>
            <p className="mt-1 font-medium text-foreground">ไม่ต้องมีแท็บพนักงานถ้าไม่ได้อัปเดตพนักงาน</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              แท็บที่รองรับ: {EXPECTED_SHEETS.join(", ")}
            </p>
          </li>
          <li className="rounded-md border border-border bg-muted/40 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">ขั้นที่ 3 · เลือกเฉพาะส่วนที่ต้องการนำเข้า</span>
            <p className="mt-1 font-medium text-foreground">ส่วนที่ไม่เลือกจะใช้ข้อมูลเดิมในระบบต่อไป</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              หากเลือกพนักงาน ระบบจะอัปเดตแบบ Upsert โดยเก็บรหัสผ่านและสิทธิ์ผู้ใช้เดิมไว้
            </p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="upload-heading" className="rounded-lg border border-border bg-card p-5 space-y-4">
        <SectionHeading
          id="upload-heading"
          title="อัปโหลดไฟล์ .xlsx"
          description="เลือกไฟล์จาก Google Sheet เพื่อตรวจสอบรายการและเลือกส่วนที่ต้องการนำเข้า"
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
              title="เลือกส่วนข้อมูลที่ต้องการนำเข้า"
              description={`ไฟล์: ${preview.fileName} — เลือกได้เฉพาะแท็บที่ต้องการอัปเดต ส่วนอื่นจะคงข้อมูลปัจจุบันในระบบไว้`}
            />
            <div className="flex flex-wrap items-center gap-2">
              {availableSections.length > 1 ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={importing || selectedSections.length === availableSections.length}
                    onClick={selectAllAvailable}
                  >
                    เลือกทั้งหมดที่มีในไฟล์
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={importing || selectedSections.length === 0}
                    onClick={clearSelectedSections}
                  >
                    ล้างการเลือก
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {preview.sheetsFound.map((sheet) => (
              <Badge key={sheet} variant="caption" className="border-status-success/30 bg-status-success/10 text-status-success">
                พบแท็บ: {sheet}
              </Badge>
            ))}
            {preview.sheetsMissing.map((sheet) => (
              <Badge key={sheet} variant="caption" className="border-border bg-muted text-muted-foreground">
                ไม่มีแท็บ: {sheet}
              </Badge>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MIGRATION_SECTIONS.map((section) => {
              const meta = SECTION_META[section];
              const isAvailable = availableSections.includes(section);
              const isSelected = selectedSections.includes(section);
              const checkboxId = `${sectionCheckboxPrefix}-${section}`;

              return (
                <label
                  key={section}
                  htmlFor={checkboxId}
                  className={cn(
                    "flex min-h-28 flex-col justify-between gap-3 rounded-md border p-4 transition-colors",
                    isAvailable ? "cursor-pointer" : "cursor-not-allowed bg-muted/30 opacity-60",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Checkbox
                        id={checkboxId}
                        className="mt-0.5"
                        isSelected={isSelected}
                        isDisabled={!isAvailable || importing}
                        onChange={(checked) => toggleSection(section, checked)}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                        <p className="text-xs text-muted-foreground">แท็บ: {meta.sheet}</p>
                      </div>
                    </div>
                    <Badge
                      variant="caption"
                      className={cn(
                        "shrink-0",
                        !isAvailable
                          ? "border-border bg-muted text-muted-foreground"
                          : isSelected
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {!isAvailable ? "ไม่พบแท็บ" : isSelected ? "จะนำเข้าส่วนนี้" : "คงข้อมูลเดิม"}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-xs tabular-nums">
                    <p className="font-medium text-foreground">{meta.fileSummary(summary)}</p>
                    {dbCounts ? <p className="text-muted-foreground">{meta.dbSummary(dbCounts)}</p> : null}
                    <p className="text-muted-foreground">{meta.modeText}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {activeBlockingErrors.length > 0 ? (
            <div role="alert" className="rounded-md border border-status-danger/30 bg-status-danger/10 p-4 space-y-2">
              <div className="flex items-center gap-2 font-medium text-sm text-status-danger">
                <RiErrorWarningLine className="size-4 shrink-0" aria-hidden="true" />
                พบข้อผิดพลาดสำหรับส่วนที่เลือก ({activeBlockingErrors.length} รายการ)
              </div>
              <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-xs leading-5 text-foreground">
                {activeBlockingErrors.map((item, idx) => (
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

          <div
            className={cn(
              "rounded-md border p-4 space-y-3",
              hasDestructiveSelected
                ? "border-status-danger/30 bg-status-danger/5"
                : "border-border bg-muted/20",
            )}
          >
            <div className="space-y-1 text-sm">
              <p className={cn("font-semibold", hasDestructiveSelected ? "text-status-danger" : "text-foreground")}>
                สรุปผลกระทบก่อนบันทึก
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs leading-5 text-muted-foreground">
                <li>
                  <strong>ส่วนที่จะนำเข้าจากไฟล์ใหม่ ({selectedSections.length} ส่วน):</strong>{" "}
                  {selectedSections.length > 0
                    ? selectedSections.map((s) => `${SECTION_META[s].label} (${SECTION_META[s].modeText})`).join(" · ")
                    : "ยังไม่ได้เลือกส่วนที่ต้องการนำเข้า — กรุณาติ๊กเลือกอย่างน้อย 1 ส่วนด้านบน"}
                </li>
                <li>
                  <strong>ข้อมูลที่ยังคงเก็บไว้ตามเดิมในระบบ:</strong>{" "}
                  {unselectedAvailable.length > 0 || preview.sheetsMissing.length > 0
                    ? "ส่วนข้อมูลที่ไม่ได้เลือกทั้งหมด, "
                    : ""}
                  รหัสผ่าน/บทบาท/สิทธิ์ของบัญชี <code>users</code> ที่มีอยู่, บัญชีผู้ดูแลระบบกลาง (<code>admin</code>), แม่แบบข้อตกลงทรัพย์สิน, ประวัติ Webhook/กิจกรรม LINE, ประเภทการลา และค่าเรท OT กลาง
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
                  isDisabled={importing || selectedSections.length === 0 || activeBlockingErrors.length > 0}
                />
                <span>ฉันตรวจสอบส่วนที่เลือกแล้ว และยืนยันการนำเข้าข้อมูลเฉพาะส่วนที่เลือก</span>
              </label>

              <Button
                type="button"
                variant={hasDestructiveSelected ? "danger" : "primary"}
                leadingIcon={RiUploadCloud2Line}
                disabled={!confirmed || importing || selectedSections.length === 0 || activeBlockingErrors.length > 0}
                onClick={() => setConfirmOpen(true)}
              >
                {importing ? "กำลังบันทึกข้อมูล..." : `นำเข้าเฉพาะส่วนที่เลือก (${selectedSections.length})`}
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
              <h2 className="text-base font-semibold text-foreground">นำเข้าข้อมูลเฉพาะส่วนที่เลือกเรียบร้อยแล้ว</h2>
              <p className="text-xs text-muted-foreground">
                ไฟล์ {result.fileName} — นำเข้า {(result.imported.importedSections ?? []).map((s) => SECTION_META[s]?.label ?? s).join(", ")}
                {(result.imported.importedSections ?? []).includes("employees")
                  ? ` (พนักงาน: อัปเดต ${result.imported.employeesUpdated ?? 0} คน · เพิ่มใหม่ ${result.imported.employeesInserted ?? 0} คน · คงบัญชีเดิม ${result.imported.usersExistingKept ?? 0} บัญชี · สร้างบัญชีใหม่ ${result.imported.usersProvisioned ?? 0} บัญชี${(result.imported.usersSkippedNoEmail ?? 0) > 0 ? ` · ข้าม ${result.imported.usersSkippedNoEmail} คนที่ไม่มีอีเมลที่ถูกต้อง` : ""})`
                  : ""}
                {(result.imported.importedSections ?? []).includes("overtime")
                  ? ` · OT ${result.imported.overtimeRequests} รายการ`
                  : ""}
                {(result.imported.importedSections ?? []).includes("leave")
                  ? ` · วันลา ${result.imported.leaveRequests} รายการ`
                  : ""}
                {(result.imported.importedSections ?? []).includes("assets")
                  ? ` · ยืมทรัพย์สิน ${result.imported.assetRequests} รายการ (Agreement ${result.imported.assetAgreements} ฉบับ)`
                  : ""}
                {(result.imported.importedSections ?? []).includes("workTracking")
                  ? ` · ข้อมูลงาน ${result.imported.workTrackingRecords} รายการ`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(result.imported.importedSections ?? []).map((section) => (
              <Button key={section} asChild size="sm" variant="outline">
                <Link href={SECTION_META[section].href}>{SECTION_META[section].linkLabel}</Link>
              </Button>
            ))}
            {(result.imported.importedSections ?? []).includes("employees") ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/settings">จัดการสิทธิ์ผู้ใช้</Link>
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <HrmDialog
        open={confirmOpen}
        onClose={() => { if (!importing) setConfirmOpen(false); }}
        title="ยืนยันการนำเข้าข้อมูลเฉพาะส่วนที่เลือก"
        description="ระบบจะนำเข้าเฉพาะส่วนที่คุณเลือกไว้ด้านล่าง ส่วนข้อมูลอื่นๆ ที่ไม่ได้เลือกจะยังคงเดิมในฐานข้อมูลทั้งหมด"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={importing} onClick={() => setConfirmOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant={hasDestructiveSelected ? "danger" : "primary"}
              disabled={importing}
              onClick={handleConfirmImport}
            >
              {importing ? "กำลังบันทึกข้อมูล..." : "ยืนยันนำเข้าส่วนที่เลือก"}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 py-2 text-sm text-muted-foreground">
          <p>ไฟล์ที่เลือก: <strong className="text-foreground">{selectedFile?.name}</strong></p>
          {summary && selectedSections.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs leading-5">
              {selectedSections.map((section) => (
                <li key={section}>
                  <strong className="text-foreground">{SECTION_META[section].label}:</strong>{" "}
                  {SECTION_META[section].confirmSummary(summary)} ({SECTION_META[section].modeText})
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            ข้อมูลส่วนที่ไม่ได้เลือก รวมถึงรหัสผ่านและสิทธิ์บัญชีผู้ใช้เดิมจะไม่ถูกเปลี่ยนแปลง
          </p>
        </div>
      </HrmDialog>
    </div>
  );
}
