"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDate, getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { RiInformationLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TimePicker } from "@/components/ui/time-picker";
import { Textarea } from "@/components/ui/textarea";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { computeDurationHours, formatDuration } from "@/components/hrm/ot/otStatus";

function defaultDate() {
  try {
    return today(getLocalTimeZone());
  } catch {
    return new CalendarDate(2026, 9, 25);
  }
}

const DEFAULT_START_TIME = "18:00";
const DEFAULT_END_TIME = "20:00";

// `editingItem` (an OT item DTO, i.e. GET /api/ot's shape) switches this
// dialog into edit mode: fields prefill from it and submit calls
// PATCH /api/ot/[id] instead of POST /api/ot, calling onUpdated instead of
// onCreated. Passing null/undefined keeps the original "add" behavior.
export function AddOtDialog({ open, onClose, editingItem = null, onCreated = () => {}, onUpdated = () => {} }) {
  const isEditing = Boolean(editingItem);
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Re-seed the form whenever the dialog opens, from editingItem when
  // present or the create defaults otherwise — runs once per open rather
  // than on every editingItem identity change, since the dialog stays
  // mounted between opens.
  useEffect(() => {
    if (!open) return;
    if (editingItem) {
      setDate(parseDate(editingItem.date));
      setStartTime(editingItem.startTime);
      setEndTime(editingItem.endTime);
      setReason(editingItem.reason || "");
    } else {
      setDate(defaultDate());
      setStartTime(DEFAULT_START_TIME);
      setEndTime(DEFAULT_END_TIME);
      setReason("");
    }
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const durationHours = useMemo(() => computeDurationHours(startTime, endTime), [startTime, endTime]);
  const durationLabel = formatDuration(durationHours);
  const isValidRange = durationHours != null;
  const canSubmit = isValidRange && Boolean(date) && reason.trim().length > 0 && !submitting;

  function resetForm() {
    setDate(defaultDate());
    setStartTime(DEFAULT_START_TIME);
    setEndTime(DEFAULT_END_TIME);
    setReason("");
    setError("");
  }

  function handleClose() {
    if (!isEditing) resetForm();
    onClose?.();
  }

  async function submit(event) {
    event.preventDefault();
    if (!isValidRange) {
      setError("ช่วงเวลาไม่ถูกต้อง กรุณาตรวจสอบเวลาเริ่มและสิ้นสุด");
      return;
    }
    if (!date || !reason.trim()) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(isEditing ? `/api/ot/${editingItem.id}` : "/api/ot", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: date.toString(),
          startTime,
          endTime,
          reason: reason.trim(),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error || (isEditing ? "ไม่สามารถบันทึกการแก้ไขได้ กรุณาลองใหม่" : "ไม่สามารถส่งคำขอ OT ได้ กรุณาลองใหม่"));
        return;
      }

      const payload = await response.json();
      if (isEditing) {
        onUpdated?.(payload.item);
      } else {
        onCreated?.(payload.item);
        resetForm();
      }
      onClose?.();
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <HrmDialog
      open={open}
      onClose={handleClose}
      title={isEditing ? "แก้ไขคำขอ OT" : "ยื่นคำขอ OT"}
      description={isEditing ? "แก้ไขข้อมูลคำขอ OT ที่ยังรอจัดการ" : "กรอกวันที่และเวลา ระบบจะคำนวณระยะเวลาทำ OT ให้โดยอัตโนมัติ"}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={handleClose}>ยกเลิก</Button>
          <Button type="submit" form="add-ot-form" disabled={!canSubmit}>{isEditing ? "บันทึกการแก้ไข" : "ส่งคำขอ OT"}</Button>
        </>
      }
    >
      <form id="add-ot-form" className="space-y-5" onSubmit={submit}>
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
          <span className="text-xs leading-5 text-muted-foreground">{isEditing ? "สถานะคำขอ" : "สถานะคำขอใหม่"}</span>
          <Chip variant="caption" color="yellow">รอจัดการ</Chip>
        </div>
        <div className="grid gap-4 md:grid-cols-[1.15fr_0.925fr_0.925fr]">
          <DatePickerField label="วันที่ทำ OT" value={date} onChange={setDate} isRequired />
          <TimePicker label="เวลาที่เริ่ม" value={startTime} onChange={setStartTime} isRequired />
          <TimePicker label="เวลาที่สิ้นสุด" value={endTime} onChange={setEndTime} isRequired />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <RiInformationLine className="size-5 text-primary" aria-hidden />
            <span className="text-xs leading-5 text-muted-foreground">ระยะเวลาทำ OT</span>
          </div>
          <strong className="text-lg font-semibold tracking-tight leading-6 text-primary">{durationLabel}</strong>
        </div>
        <Textarea
          label="รายละเอียดงานที่ทำ"
          placeholder="ระบุงานที่ทำในช่วงเวลา OT"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          isRequired
        />
        {error ? <p className="text-xs leading-5 text-status-danger">{error}</p> : null}
      </form>
    </HrmDialog>
  );
}

export default AddOtDialog;
