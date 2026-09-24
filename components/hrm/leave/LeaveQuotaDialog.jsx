"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { LEAVE_TYPE_PRESENTATION } from "@/components/hrm/leave/leaveTypes";

const QUOTAS_ENDPOINT = "/api/leave-types/quotas";
const MAX_QUOTA_DAYS = 2_147_483_647;

export function LeaveQuotaDialog({ open, onClose, onSaved = () => {} }) {
  const [quotas, setQuotas] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setSaveError("");

    fetch("/api/leave-types")
      .then((response) => {
        if (!response.ok) throw new Error("failed to load leave types");
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const byCode = new Map((payload.items || []).map((item) => [item.code, item]));
        const missing = LEAVE_TYPE_PRESENTATION.filter((type) => !byCode.has(type.code));
        if (missing.length > 0) {
          setLoadError(`ไม่พบประเภทการลาในฐานข้อมูล: ${missing.map((type) => type.name).join(", ")}`);
        }
        setQuotas(Object.fromEntries(
          LEAVE_TYPE_PRESENTATION.map((type) => {
            const quota = byCode.get(type.code)?.annualQuotaDays;
            return [type.code, quota == null ? "" : String(quota)];
          }),
        ));
      })
      .catch(() => {
        if (!cancelled) setLoadError("โหลดโควต้าจากฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const canSave = !loading && !saving && !loadError && LEAVE_TYPE_PRESENTATION.every((type) => {
    const value = quotas[type.code];
    const amount = Number(value);
    return value === "" || (Number.isInteger(amount) && amount >= 0 && amount <= MAX_QUOTA_DAYS);
  });

  function close() {
    if (!saving) onClose?.();
  }

  async function submit(event) {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setSaveError("");
    try {
      const values = Object.fromEntries(
        LEAVE_TYPE_PRESENTATION.map((type) => [
          type.code,
          quotas[type.code] === "" ? null : Number(quotas[type.code]),
        ]),
      );
      const response = await fetch(QUOTAS_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotas: values }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveError(payload.error || "บันทึกโควตาไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      onSaved?.(payload.items);
      onClose?.();
    } catch {
      setSaveError("เชื่อมต่อฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  return (
    <HrmDialog
      open={open}
      onClose={close}
      title="ตั้งค่าโควต้าการลา"
      description="กำหนดจำนวนวันลาสูงสุดต่อปีสำหรับพนักงานทุกคน"
      size="md"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={close} disabled={saving}>ยกเลิก</Button>
          <Button type="submit" form="leave-quota-form" disabled={!canSave}>{saving ? "กำลังบันทึก..." : "บันทึกโควตา"}</Button>
        </>
      )}
    >
      <form id="leave-quota-form" className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-3">
          {LEAVE_TYPE_PRESENTATION.map((type) => (
            <Input
              key={type.code}
              label={`${type.name} (วัน/ปี)`}
              type="number"
              min={0}
              max={MAX_QUOTA_DAYS}
              step={1}
              value={quotas[type.code] ?? ""}
              onChange={(value) => setQuotas((current) => ({ ...current, [type.code]: value }))}
              isDisabled={loading || saving || Boolean(loadError)}
            />
          ))}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">ใส่จำนวนเต็มตั้งแต่ 0 วันขึ้นไป หรือเว้นว่างหากไม่จำกัดโควตา</p>
        {loading ? <p role="status" className="text-xs leading-5 text-muted-foreground">กำลังโหลดโควต้าจากฐานข้อมูล...</p> : null}
        {loadError ? <p role="alert" className="text-xs leading-5 text-status-danger">{loadError}</p> : null}
        {saveError ? <p role="alert" className="text-xs leading-5 text-status-danger">{saveError}</p> : null}
      </form>
    </HrmDialog>
  );
}

export default LeaveQuotaDialog;
