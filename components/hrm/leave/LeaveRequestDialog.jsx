"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDate, getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { RiDeleteBin6Line, RiExternalLinkLine, RiImageAddLine, RiInformationLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { IntegrationFeatureNotice, useHrmIntegrations } from "@/components/hrm/IntegrationNotice";
import { formatDays } from "@/components/hrm/leave/leaveStatus";
import { withCustomLeaveTypes } from "@/components/hrm/leave/leaveTypes";
import { uploadImage } from "@/lib/client/upload-image";

function defaultDate() {
  try {
    return today(getLocalTimeZone());
  } catch {
    return new CalendarDate(2026, 9, 25);
  }
}

const SESSION_OPTIONS = [
  { id: "full", label: "เต็มวัน" },
  { id: "am", label: "ครึ่งวันเช้า" },
  { id: "pm", label: "ครึ่งวันบ่าย" },
];

// Inclusive day-span, mirrors app/api/leave/_shared.ts's leaveDaySpan — kept
// as a small local copy since client components don't import server code.
function daySpan(start, end, session) {
  if (!start || !end) return 0;
  const startStr = start.toString();
  const endStr = end.toString();
  if (startStr === endStr && session !== "full") return 0.5;
  const startMs = new Date(`${startStr}T00:00:00Z`).getTime();
  const endMs = new Date(`${endStr}T00:00:00Z`).getTime();
  if (endMs < startMs) return 0;
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

// Handles both creating a new request (mode="create", POST /api/leave) and
// editing an own pending one (mode="edit", PATCH /api/leave/[id]) — same
// fields, same validation, so one dialog covers both rather than forking
// the form.
export function LeaveRequestDialog({ open, mode = "create", initialValues = null, onClose, onSaved = () => {} }) {
  const isEdit = mode === "edit";
  const attachmentInputId = useId();
  const attachmentInputRef = useRef(null);
  const employeeId = useHrmRole()?.employeeId;
  const integrations = useHrmIntegrations();
  const cloudinaryReady = integrations?.cloudinary !== false;
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveTypesLoading, setLeaveTypesLoading] = useState(false);
  const [leaveTypesError, setLeaveTypesError] = useState("");
  const [quotaRows, setQuotaRows] = useState([]);
  const [quotaLoadedFor, setQuotaLoadedFor] = useState("");
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState("");
  const [leaveTypeCode, setLeaveTypeCode] = useState("");
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [session, setSession] = useState("full");
  const [reason, setReason] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const quotaYear = startDate?.year;

  useEffect(() => {
    if (!open) {
      setQuotaRows([]);
      setQuotaLoadedFor("");
      setQuotaLoading(false);
      return undefined;
    }
    if (!employeeId) {
      setQuotaRows([]);
      setQuotaLoadedFor("");
      setQuotaLoading(false);
      setQuotaError("ไม่พบข้อมูลพนักงาน จึงตรวจสอบโควต้าการลาไม่ได้");
      return undefined;
    }

    let cancelled = false;
    setQuotaLoading(true);
    setQuotaError("");
    setQuotaRows([]);
    setQuotaLoadedFor("");
    fetch(`/api/leave/summary?employeeId=${encodeURIComponent(employeeId)}&year=${quotaYear}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "โหลดโควต้าการลาไม่สำเร็จ");
        if (payload.scope !== "individual" || payload.employeeId !== employeeId || !Array.isArray(payload.quotas)) {
          throw new Error("ไม่พบข้อมูลโควต้าการลาของพนักงาน");
        }
        return payload.quotas;
      })
      .then((quotas) => {
        if (!cancelled) {
          setQuotaRows(quotas);
          setQuotaLoadedFor(`${employeeId}:${quotaYear}`);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setQuotaRows([]);
          setQuotaLoadedFor("");
          setQuotaError(cause instanceof Error ? cause.message : "โหลดโควต้าการลาไม่สำเร็จ กรุณาลองใหม่");
        }
      })
      .finally(() => {
        if (!cancelled) setQuotaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, employeeId, quotaYear]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLeaveTypesLoading(true);
    setLeaveTypesError("");
    fetch("/api/leave-types")
      .then((response) => {
        if (!response.ok) throw new Error("failed to load leave types");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) {
          const supportedTypes = (payload.items || []).filter((type) => type.isActive);
          // Built-in types first in their fixed order, then the ones configured in Settings.
          const order = withCustomLeaveTypes(supportedTypes).map((type) => type.code);
          setLeaveTypes(supportedTypes.toSorted((left, right) => order.indexOf(left.code) - order.indexOf(right.code)));
          if (supportedTypes.length === 0) setLeaveTypesError("ไม่พบประเภทการลาที่เปิดใช้งานในฐานข้อมูล");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeaveTypes([]);
          setLeaveTypesError("โหลดประเภทการลาไม่สำเร็จ กรุณาลองปิดแล้วเปิดหน้าต่างใหม่");
        }
      })
      .finally(() => {
        if (!cancelled) setLeaveTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (isEdit && initialValues) {
      setLeaveTypeCode(initialValues.leaveTypeCode || "");
      setStartDate(initialValues.startOn ? parseDate(initialValues.startOn) : defaultDate());
      setEndDate(initialValues.endOn ? parseDate(initialValues.endOn) : defaultDate());
      setSession(initialValues.session || "full");
      setReason(initialValues.reason || "");
      setAttachmentUrl(initialValues.attachmentUrl || "");
    } else {
      setLeaveTypeCode((current) => current || "");
      setStartDate(defaultDate());
      setEndDate(defaultDate());
      setSession("full");
      setReason("");
      setAttachmentUrl("");
    }
    setAttachmentError("");
    setUploadingAttachment(false);
    setError("");
  }, [open, isEdit, initialValues]);

  useEffect(() => {
    if (!open || isEdit) return;
    if (leaveTypes.length > 0 && !leaveTypes.some((type) => type.code === leaveTypeCode)) {
      setLeaveTypeCode(leaveTypes[0].code);
    }
  }, [open, isEdit, leaveTypes, leaveTypeCode]);

  const isSingleDay = startDate && endDate && startDate.toString() === endDate.toString();
  const days = useMemo(() => daySpan(startDate, endDate, session), [startDate, endDate, session]);
  const isValidRange = Boolean(startDate) && Boolean(endDate) && startDate.compare(endDate) <= 0;
  const isValidSession = isSingleDay || session === "full";
  const selectedQuota = quotaRows.find((quota) => quota.code === leaveTypeCode);
  const ownPendingDays = isEdit && initialValues?.leaveTypeCode === leaveTypeCode && initialValues.startOn?.slice(0, 4) === String(quotaYear)
    ? daySpan(parseDate(initialValues.startOn), parseDate(initialValues.endOn), initialValues.session || "full")
    : 0;
  const availableDays = selectedQuota?.annualQuotaDays == null
    ? null
    : Math.max(0, (selectedQuota.availableDays ?? selectedQuota.remainingDays) + ownPendingDays);
  const quotaExceeded = selectedQuota?.annualQuotaDays != null && days > availableDays;
  const quotaReady = !quotaLoading && !quotaError && quotaLoadedFor === `${employeeId}:${quotaYear}` && Boolean(selectedQuota);
  const canSubmit = leaveTypes.some((type) => type.code === leaveTypeCode) && isValidRange && isValidSession && quotaReady && !quotaExceeded && !leaveTypesLoading && !uploadingAttachment && !submitting;

  function resetForm() {
    setLeaveTypeCode("");
    setStartDate(defaultDate());
    setEndDate(defaultDate());
    setSession("full");
    setReason("");
    setAttachmentUrl("");
    setAttachmentError("");
    setUploadingAttachment(false);
    setError("");
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }

  async function handleAttachmentChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isEdit) return;
    setAttachmentError("");
    setUploadingAttachment(true);
    try {
      const uploadedUrl = await uploadImage(file, {
        scope: "leave",
        maxBytes: 10 * 1024 * 1024,
      });
      setAttachmentUrl(uploadedUrl);
    } catch (uploadError) {
      setAttachmentError(uploadError instanceof Error ? uploadError.message : "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setUploadingAttachment(false);
    }
  }

  function handleClose() {
    if (!isEdit) resetForm();
    onClose?.();
  }

  function handleStartChange(nextDate) {
    setStartDate(nextDate);
    if (nextDate && endDate && nextDate.compare(endDate) > 0) setEndDate(nextDate);
  }

  async function submit(event) {
    event.preventDefault();
    if (!leaveTypeCode) {
      setError("กรุณาเลือกประเภทการลา");
      return;
    }
    if (!isValidRange) {
      setError("ช่วงวันที่ไม่ถูกต้อง กรุณาตรวจสอบวันที่เริ่มและสิ้นสุด");
      return;
    }
    if (!isValidSession) {
      setError("ครึ่งวันใช้ได้เฉพาะคำขอลาแบบวันเดียวเท่านั้น");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const body = {
        leaveTypeCode,
        startOn: startDate.toString(),
        endOn: endDate.toString(),
        session,
        reason: reason.trim(),
        ...(!isEdit && attachmentUrl ? { attachmentUrl } : {}),
      };
      const url = isEdit ? `/api/leave/${initialValues.id}` : "/api/leave";
      const response = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error || "ไม่สามารถบันทึกคำขอลาได้ กรุณาลองใหม่");
        return;
      }

      const payload = await response.json();
      onSaved?.(payload.item);
      if (!isEdit) resetForm();
      onClose?.();
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  const formId = isEdit ? "edit-leave-form" : "add-leave-form";

  return (
    <HrmDialog
      open={open}
      onClose={handleClose}
      title={isEdit ? "แก้ไขคำขอลา" : "เพิ่มข้อมูลการลา"}
      description="ระบุประเภท ช่วงวันที่ และเหตุผลของการลาให้ครบถ้วน"
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={handleClose}>ยกเลิก</Button>
          <Button type="submit" form={formId} disabled={!canSubmit}>{isEdit ? "บันทึกการแก้ไข" : "ส่งคำขอลา"}</Button>
        </>
      }
    >
      <form id={formId} className="space-y-5" onSubmit={submit}>
        {!isEdit ? (
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
            <span className="text-xs leading-5 text-muted-foreground">สถานะคำขอใหม่</span>
            <Chip variant="caption" color="yellow">รอจัดการ</Chip>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <span className="text-xs font-medium leading-5 text-muted-foreground">ประเภทการลา</span>
            <Select
              aria-label="ประเภทการลา"
              selectedKey={leaveTypeCode}
              onSelectionChange={(value) => setLeaveTypeCode(String(value))}
              isDisabled={leaveTypesLoading || leaveTypes.length === 0}
            >
              {leaveTypes.map((type) => (
                <SelectItem id={type.code} key={type.code}>{type.name}</SelectItem>
              ))}
            </Select>
            {leaveTypesLoading ? <p role="status" className="text-xs leading-5 text-muted-foreground">กำลังโหลดประเภทการลา...</p> : null}
            {leaveTypesError ? <p role="alert" className="text-xs leading-5 text-status-danger">{leaveTypesError}</p> : null}
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium leading-5 text-muted-foreground">ช่วงที่ลา</span>
            <Select
              aria-label="ช่วงที่ลา"
              selectedKey={session}
              onSelectionChange={(value) => setSession(String(value))}
              isDisabled={!isSingleDay}
            >
              {SESSION_OPTIONS.map((option) => (
                <SelectItem id={option.id} key={option.id}>{option.label}</SelectItem>
              ))}
            </Select>
          </div>
          <DatePickerField label="วันที่เริ่มลา" value={startDate} onChange={handleStartChange} isRequired />
          <DatePickerField label="วันที่สิ้นสุดการลา" value={endDate} onChange={setEndDate} isRequired />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <RiInformationLine className="size-5 text-primary" aria-hidden />
            <span className="text-xs leading-5 text-muted-foreground">จำนวนวันลา</span>
          </div>
          <strong className="text-lg font-semibold tracking-tight leading-6 text-primary">{formatDays(days)}</strong>
        </div>
        {quotaLoading ? (
          <p role="status" className="text-xs leading-5 text-muted-foreground">กำลังตรวจสอบโควต้าคงเหลือสำหรับปี {quotaYear}...</p>
        ) : quotaError ? (
          <p role="alert" className="text-xs leading-5 text-status-danger">{quotaError}</p>
        ) : !selectedQuota ? (
          <p role="alert" className="text-xs leading-5 text-status-danger">ไม่พบข้อมูลโควต้าสำหรับประเภทการลานี้ จึงยังส่งคำขอไม่ได้</p>
        ) : selectedQuota.annualQuotaDays == null ? (
          <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground">ประเภทนี้ไม่มีการจำกัดโควต้ารายปี</p>
        ) : quotaExceeded ? (
          <div role="alert" className="rounded-xl border border-status-danger/30 bg-status-danger/5 px-4 py-3 text-xs leading-5 text-status-danger">
            จำนวนวันที่ขอ ({formatDays(days)} วัน) เกินโควต้าคงเหลือของประเภทนี้ ({formatDays(availableDays)} วัน) กรุณาปรับช่วงวันลา
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-5">
            <span className="text-muted-foreground">โควต้าปี {quotaYear}: ใช้แล้ว {formatDays(selectedQuota.usedDays)} วัน · รออนุมัติ {formatDays(Math.max(0, selectedQuota.pendingDays - ownPendingDays))} วัน · ทั้งหมด {formatDays(selectedQuota.annualQuotaDays)} วัน</span>
            <span className="font-medium text-foreground">คงเหลือ {formatDays(availableDays)} วัน</span>
          </div>
        )}
        <Textarea
          label="สาเหตุการลา"
          hint="ไม่บังคับ แต่ช่วยให้หัวหน้างานพิจารณาได้เร็วขึ้น"
          placeholder="เช่น ติดต่อราชการ หรือพักฟื้น"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {!isEdit ? (
          <div className="space-y-2">
            <label htmlFor={attachmentInputId} className="block text-xs font-medium leading-5 text-muted-foreground">
              หลักฐานประกอบการลา (รูปภาพ)
            </label>
            {!cloudinaryReady ? (
              <IntegrationFeatureNotice service="cloudinary" />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id={attachmentInputId}
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploadingAttachment || submitting}
                  onChange={handleAttachmentChange}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  leadingIcon={RiImageAddLine}
                  disabled={uploadingAttachment || submitting}
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  {uploadingAttachment ? "กำลังอัปโหลดรูป..." : attachmentUrl ? "เปลี่ยนรูปแนบ" : "อัปโหลดรูปหลักฐาน"}
                </Button>
                {attachmentUrl ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    leadingIcon={RiDeleteBin6Line}
                    disabled={uploadingAttachment || submitting}
                    onClick={() => setAttachmentUrl("")}
                  >
                    ลบรูปแนบ
                  </Button>
                ) : null}
              </div>
            )}
            {attachmentUrl ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2.5">
                <img
                  src={attachmentUrl}
                  alt="ตัวอย่างหลักฐานการลา"
                  className="size-16 shrink-0 rounded-md border border-border object-cover"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-xs text-foreground">อัปโหลดรูปเรียบร้อยแล้ว</p>
                  <a
                    href={attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    เปิดดูรูป <RiExternalLinkLine className="size-3.5" aria-hidden="true" />
                  </a>
                </div>
              </div>
            ) : null}
            {attachmentError ? <p role="alert" className="text-xs leading-5 text-status-danger">{attachmentError}</p> : null}
          </div>
        ) : initialValues?.attachmentUrl ? (
          <div className="space-y-2">
            <span className="block text-xs font-medium leading-5 text-muted-foreground">
              หลักฐานแนบเดิม (ดูอย่างเดียว)
            </span>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2.5">
              <img
                src={initialValues.attachmentUrl}
                alt="หลักฐานประกอบการลา"
                className="size-16 shrink-0 rounded-md border border-border object-cover"
              />
              <a
                href={initialValues.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                เปิดดูรูปขนาดเต็ม <RiExternalLinkLine className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        ) : null}
        {error ? <p className="text-xs leading-5 text-status-danger">{error}</p> : null}
      </form>
    </HrmDialog>
  );
}

export default LeaveRequestDialog;
