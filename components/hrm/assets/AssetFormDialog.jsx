"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { ASSET_STATUS_OPTIONS } from "@/components/hrm/assets/assetStatus";

// Add/edit dialog for asset master data — canManageAssets-gated by the
// caller (AssetInventoryView never mounts this for an `employee` role).
// `asset` null => POST /api/assets (create); `asset` set => PATCH
// /api/assets/[id] (edit, including manually moving status outside the
// borrow workflow, e.g. to maintenance/retired).
export function AssetFormDialog({ open, onClose, asset = null, onSaved = () => {} }) {
  const isEdit = Boolean(asset);
  const [categories, setCategories] = useState([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [status, setStatus] = useState("available");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/asset-categories")
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((payload) => setCategories(payload.items || []))
      .catch(() => setCategories([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCode(asset?.code || "");
    setName(asset?.name || "");
    setCategoryId(asset ? String(asset.categoryId) : "");
    setSerialNumber(asset?.serialNumber || "");
    setStatus(asset?.status || "available");
    setNotes(asset?.notes || "");
    setError("");
  }, [open, asset]);

  const canSubmit = name.trim().length > 0 && categoryId !== "" && !submitting;

  function handleClose() {
    setError("");
    onClose?.();
  }

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        categoryId: Number(categoryId),
        serialNumber: serialNumber.trim() || null,
        status,
        notes: notes.trim() || null,
      };
      if (code.trim()) body.code = code.trim();

      const response = await fetch(isEdit ? `/api/assets/${asset.id}` : "/api/assets", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error || "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่");
        return;
      }

      const payload = await response.json();
      onSaved?.(payload.item, isEdit);
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
      title={isEdit ? "แก้ไขทรัพย์สิน" : "เพิ่มทรัพย์สินใหม่"}
      description={isEdit ? "ปรับปรุงข้อมูลทรัพย์สินในทะเบียน" : "เว้นรหัสว่างไว้ได้หากต้องการให้ระบบสร้างให้อัตโนมัติ"}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={handleClose}>ยกเลิก</Button>
          <Button type="submit" form="asset-form" isDisabled={!canSubmit}>บันทึก</Button>
        </>
      }
    >
      <form id="asset-form" className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="รหัสทรัพย์สิน" placeholder="เว้นว่างให้ระบบสร้างให้อัตโนมัติ" value={code} onChange={setCode} />
          <div className="space-y-1.5">
            <span className="text-sm font-medium leading-none">หมวดหมู่</span>
            <Select aria-label="หมวดหมู่ทรัพย์สิน" selectedKey={categoryId} onSelectionChange={(key) => setCategoryId(String(key))} className="w-full">
              <>{categories.map((category) => <SelectItem id={category.id} key={category.id}>{category.name}</SelectItem>)}</>
            </Select>
          </div>
        </div>
        <Input label="ชื่อทรัพย์สิน" value={name} onChange={setName} isRequired />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="หมายเลขซีเรียล" value={serialNumber} onChange={setSerialNumber} />
          <div className="space-y-1.5">
            <span className="text-sm font-medium leading-none">สถานะ</span>
            <Select aria-label="สถานะทรัพย์สิน" selectedKey={status} onSelectionChange={(key) => setStatus(String(key))} className="w-full">
              <>{ASSET_STATUS_OPTIONS.map(([value, label]) => <SelectItem id={value} key={value}>{label}</SelectItem>)}</>
            </Select>
          </div>
        </div>
        <Textarea label="หมายเหตุ" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        {error ? <p className="text-xs leading-5 text-status-danger">{error}</p> : null}
      </form>
    </HrmDialog>
  );
}

export default AssetFormDialog;
