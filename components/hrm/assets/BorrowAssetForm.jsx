"use client";

import { useEffect, useState } from "react";
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import { RiArchiveLine, RiCheckboxCircleLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function defaultDate() {
  try {
    return today(getLocalTimeZone());
  } catch {
    return new CalendarDate(2026, 9, 23);
  }
}

function defaultDueDate() {
  return defaultDate().add({ days: 7 });
}

// Real POST /api/asset-loans request form — the asset Select is populated
// from GET /api/assets?status=available only (an in_use/maintenance/retired
// asset never shows up here, matching the API's own 409 guard). No more
// directly mutating an asset row the way the old mock did.
export function BorrowAssetForm({ refreshKey = 0, onSubmitted = () => {} }) {
  const [availableAssets, setAvailableAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetId, setAssetId] = useState("");
  const [checkoutDate, setCheckoutDate] = useState(defaultDate);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingAssets(true);
    fetch("/api/assets?status=available")
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((payload) => {
        if (cancelled) return;
        const items = payload.items || [];
        setAvailableAssets(items);
        setAssetId((current) => (items.some((asset) => asset.id === current) ? current : items[0]?.id || ""));
      })
      .catch(() => {
        if (!cancelled) setAvailableAssets([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAssets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const validRange = Boolean(checkoutDate) && Boolean(dueDate) && checkoutDate.toString() <= dueDate.toString();
  const canSubmit = Boolean(assetId) && validRange && !submitting;

  function resetForm() {
    setCheckoutDate(defaultDate());
    setDueDate(defaultDueDate());
    setPurpose("");
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!assetId) {
      setError("กรุณาเลือกทรัพย์สินที่ต้องการยืม");
      return;
    }
    if (!validRange) {
      setError("วันที่รับทรัพย์สินต้องไม่เกินกำหนดคืน");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/asset-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          checkoutDate: checkoutDate.toString(),
          dueDate: dueDate.toString(),
          purpose: purpose.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error || "ไม่สามารถส่งคำขอยืมได้ กรุณาลองใหม่");
        return;
      }

      const payload = await response.json();
      resetForm();
      onSubmitted?.(payload.item);
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
      <form id="borrow-asset-form" className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6" onSubmit={submit}>
        <div className="flex items-start gap-3">
          <div className="hrm-soft-icon"><RiArchiveLine className="size-5" aria-hidden /></div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight leading-6 text-foreground">สร้างคำขอยืมทรัพย์สิน</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">เลือกอุปกรณ์และกำหนดวันคืนเพื่อส่งให้หัวหน้างาน</p>
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <span className="text-sm font-medium leading-none">ทรัพย์สิน</span>
            <Select aria-label="ทรัพย์สินที่ต้องการยืม" selectedKey={assetId} onSelectionChange={(key) => setAssetId(String(key))} className="w-full">
              <>{availableAssets.map((asset) => <SelectItem id={asset.id} key={asset.id}>{asset.name} · {asset.code}</SelectItem>)}</>
            </Select>
            {!loadingAssets && availableAssets.length === 0 ? (
              <p className="text-xs leading-5 text-muted-foreground">ไม่มีทรัพย์สินที่พร้อมให้ยืมในขณะนี้</p>
            ) : null}
          </div>
          <DatePickerField label="วันที่รับทรัพย์สิน" value={checkoutDate} onChange={setCheckoutDate} isRequired />
          <DatePickerField label="กำหนดคืน" value={dueDate} onChange={setDueDate} isRequired />
          <Textarea label="วัตถุประสงค์" placeholder="เช่น ใช้งานนอกสถานที่กับลูกค้า" rows={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} />
        </div>
        {error ? <p className="mt-4 text-xs leading-5 text-status-danger">{error}</p> : null}
        <div className="mt-6 flex justify-end">
          <Button type="submit" leadingIcon={RiCheckboxCircleLine} isDisabled={!canSubmit}>ส่งคำขอยืม</Button>
        </div>
      </form>
      <aside className="hrm-note-panel">
        <RiArchiveLine className="size-5 text-muted-foreground" aria-hidden />
        <div>
          <h3 className="text-lg font-semibold tracking-tight leading-6 text-foreground">ขั้นตอนการยืมคืน</h3>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
            <li>คำขอใหม่จะเข้ากล่องอนุมัติของหัวหน้างาน</li>
            <li>รับอุปกรณ์แล้วตรวจสอบสภาพก่อนเซ็นรับ</li>
            <li>กดรับคืนเมื่อส่งอุปกรณ์กลับ People Operations</li>
          </ul>
        </div>
      </aside>
    </section>
  );
}

export default BorrowAssetForm;
