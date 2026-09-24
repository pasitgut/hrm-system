"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDate, getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { RiInformationLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { formatDays } from "@/components/hrm/leave/leaveStatus";
import { LEAVE_TYPE_CODES, LEAVE_TYPE_PRESENTATION } from "@/components/hrm/leave/leaveTypes";

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
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveTypeCode, setLeaveTypeCode] = useState("");
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [session, setSession] = useState("full");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    fetch("/api/leave-types")
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((payload) => {
        if (!cancelled) {
          const supportedTypes = (payload.items || []).filter((type) => type.isActive && LEAVE_TYPE_CODES.has(type.code));
          setLeaveTypes(supportedTypes.toSorted((left, right) => {
            const leftIndex = LEAVE_TYPE_PRESENTATION.findIndex((type) => type.code === left.code);
            const rightIndex = LEAVE_TYPE_PRESENTATION.findIndex((type) => type.code === right.code);
            return leftIndex - rightIndex;
          }));
        }
      })
      .catch(() => {
        if (!cancelled) setLeaveTypes([]);
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
    } else {
      setLeaveTypeCode((current) => current || "");
      setStartDate(defaultDate());
      setEndDate(defaultDate());
      setSession("full");
      setReason("");
    }
    setError("");
  }, [open, isEdit, initialValues]);

  useEffect(() => {
    if (!open || isEdit) return;
    if (!leaveTypeCode && leaveTypes.length > 0) setLeaveTypeCode(leaveTypes[0].code);
  }, [open, isEdit, leaveTypes, leaveTypeCode]);

  const isSingleDay = startDate && endDate && startDate.toString() === endDate.toString();
  const days = useMemo(() => daySpan(startDate, endDate, session), [startDate, endDate, session]);
  const isValidRange = Boolean(startDate) && Boolean(endDate) && startDate.compare(endDate) <= 0;
  const isValidSession = isSingleDay || session === "full";
  const canSubmit = Boolean(leaveTypeCode) && isValidRange && isValidSession && !submitting;

  function resetForm() {
    setLeaveTypeCode("");
    setStartDate(defaultDate());
    setEndDate(defaultDate());
    setSession("full");
    setReason("");
    setError("");
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
      title={isEdit ? "แก้ไขคำขอลา" : "สร้างคำขอลา"}
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
            >
              {leaveTypes.map((type) => (
                <SelectItem id={type.code} key={type.code}>{type.name}</SelectItem>
              ))}
            </Select>
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
        <Textarea
          label="สาเหตุการลา"
          hint="ไม่บังคับ แต่ช่วยให้หัวหน้างานพิจารณาได้เร็วขึ้น"
          placeholder="เช่น ติดต่อราชการ หรือพักฟื้น"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {error ? <p className="text-xs leading-5 text-status-danger">{error}</p> : null}
      </form>
    </HrmDialog>
  );
}

export default LeaveRequestDialog;
