"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FALLBACK_RATES = { weekdayMultiplier: "1.5", holidayMultiplier: "3" };

export function OtRateSettingsTab() {
  const [rates, setRates] = useState(FALLBACK_RATES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/ot-rates")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "โหลดค่าเรท OT ไม่สำเร็จ");
        if (!cancelled) {
          setRates({
            weekdayMultiplier: String(payload.item?.weekdayMultiplier ?? FALLBACK_RATES.weekdayMultiplier),
            holidayMultiplier: String(payload.item?.holidayMultiplier ?? FALLBACK_RATES.holidayMultiplier),
          });
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "โหลดค่าเรท OT ไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function updateRate(key, value) {
    setRates((current) => ({ ...current, [key]: value }));
    setError("");
    setNotice("");
  }

  async function save() {
    const weekdayMultiplier = Number(rates.weekdayMultiplier);
    const holidayMultiplier = Number(rates.holidayMultiplier);
    if (![weekdayMultiplier, holidayMultiplier].every((value) => Number.isFinite(value) && value > 0 && value <= 10)) {
      setError("เรท OT ต้องมากกว่า 0 และไม่เกิน 10 เท่า");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings/ot-rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekdayMultiplier, holidayMultiplier }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "บันทึกค่าเรท OT ไม่สำเร็จ");
      setRates({
        weekdayMultiplier: String(payload.item.weekdayMultiplier),
        holidayMultiplier: String(payload.item.holidayMultiplier),
      });
      setNotice("บันทึกค่าเรท OT แล้ว");
    } catch (saveError) {
      setError(saveError.message || "บันทึกค่าเรท OT ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="ot-rate-settings-title" className="max-w-3xl space-y-5">
      <div>
        <h2 id="ot-rate-settings-title" className="text-base font-semibold text-foreground">ค่าเริ่มต้นเรท OT</h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          กำหนดตัวคูณสำหรับ OT วันธรรมดาและวันหยุด ระบบใช้ค่านี้กับพนักงานใหม่ โดยยังปรับเรทรายพนักงานได้แยกกัน
        </p>
      </div>

      {loading ? <p className="border-y border-border py-5 text-sm text-muted-foreground">กำลังโหลดค่าเรท OT...</p> : (
        <>
          <div className="grid gap-4 border-y border-border py-4 sm:grid-cols-2">
            <Input
              label="เรท OT วันธรรมดา (เท่า)"
              type="number"
              min="0.01"
              max="10"
              step="0.01"
              inputMode="decimal"
              value={rates.weekdayMultiplier}
              onChange={(value) => updateRate("weekdayMultiplier", value)}
              isRequired
            />
            <Input
              label="เรท OT วันหยุด (เท่า)"
              type="number"
              min="0.01"
              max="10"
              step="0.01"
              inputMode="decimal"
              value={rates.holidayMultiplier}
              onChange={(value) => updateRate("holidayMultiplier", value)}
              isRequired
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-muted-foreground">ค่าเริ่มต้นปัจจุบัน: วันธรรมดา {rates.weekdayMultiplier || "—"}× · วันหยุด {rates.holidayMultiplier || "—"}×</p>
            <Button type="button" onClick={save} disabled={saving || loading}>
              {saving ? "กำลังบันทึก..." : "บันทึกค่าเรท OT"}
            </Button>
          </div>
          <div aria-live="polite" className="min-h-5 text-sm">
            {error ? <p className="text-status-danger">{error}</p> : null}
            {notice ? <p className="text-status-success">{notice}</p> : null}
          </div>
        </>
      )}
    </section>
  );
}
