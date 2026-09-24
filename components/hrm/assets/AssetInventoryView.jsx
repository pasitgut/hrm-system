"use client";

import { useEffect, useMemo, useState } from "react";
import { RiAddLine, RiArchiveDrawerLine, RiArchiveLine, RiEditLine, RiSearchLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AssetFormDialog } from "@/components/hrm/assets/AssetFormDialog";
import { assetStatusColor, assetStatusLabel } from "@/components/hrm/assets/assetStatus";

function AssetCard({ asset, canManage, onEdit, onRetire }) {
  return (
    <article className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="hrm-soft-icon"><RiArchiveLine className="size-5" aria-hidden /></div>
          <div>
            <strong className="block text-sm font-medium leading-5 text-foreground">{asset.name}</strong>
            <span className="text-[11px] leading-4 text-muted-foreground">{asset.code}{asset.serialNumber ? ` · ${asset.serialNumber}` : ""}</span>
          </div>
        </div>
        <Chip variant="caption" color={assetStatusColor(asset.status)}>{assetStatusLabel(asset.status)}</Chip>
      </div>
      <div className="mt-4 grid gap-1 text-xs leading-5 text-muted-foreground">
        <span>หมวดหมู่: {asset.categoryName}</span>
        {asset.notes ? <span>หมายเหตุ: {asset.notes}</span> : null}
      </div>
      {canManage ? (
        <div className="mt-4 flex gap-2">
          <Button size="small" variant="secondary" leadingIcon={RiEditLine} className="flex-1" onClick={() => onEdit(asset)}>แก้ไข</Button>
          <Button
            size="small"
            variant="secondary"
            leadingIcon={RiArchiveDrawerLine}
            className="flex-1"
            isDisabled={asset.status === "retired"}
            onClick={() => onRetire(asset)}
          >
            เลิกใช้งาน
          </Button>
        </div>
      ) : null}
    </article>
  );
}

// `canManage` (from canManageAssets(role)) hides every add/edit/retire
// affordance entirely for the `employee` role — not just disables them.
// `refreshKey` bumping (owned by AssetModule) is what triggers a refetch
// here; `onChanged(message)` reports a completed mutation back up so the
// parent can bump that key and show a shared notice banner.
export function AssetInventoryView({ refreshKey = 0, canManage = false, onChanged = () => {} }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    fetch("/api/assets")
      .then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setItems(payload.items || []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("ไม่สามารถโหลดทะเบียนทรัพย์สินได้");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = useMemo(
    () =>
      items.filter((asset) =>
        `${asset.name} ${asset.code} ${asset.categoryName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      ),
    [items, query],
  );

  function openCreate() {
    setEditingAsset(null);
    setActionError("");
    setFormOpen(true);
  }

  function openEdit(asset) {
    setEditingAsset(asset);
    setActionError("");
    setFormOpen(true);
  }

  function handleSaved(item, wasEdit) {
    onChanged(wasEdit ? `บันทึกการแก้ไข "${item.name}" เรียบร้อยแล้ว` : `เพิ่มทรัพย์สิน "${item.name}" เข้าทะเบียนเรียบร้อยแล้ว`);
  }

  async function handleRetire(asset) {
    setActionError("");
    try {
      const response = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setActionError(payload.error || "ไม่สามารถเลิกใช้งานทรัพย์สินนี้ได้");
        return;
      }
      onChanged(`เลิกใช้งานทรัพย์สิน "${asset.name}" เรียบร้อยแล้ว`);
    } catch {
      setActionError("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    }
  }

  return (
    <section className="mt-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input aria-label="ค้นหาทรัพย์สิน" placeholder="ค้นหาชื่อ รหัส หรือหมวดหมู่" value={query} onChange={setQuery} leadingIcon={RiSearchLine} className="sm:w-72" />
        {canManage ? <Button leadingIcon={RiAddLine} onClick={openCreate}>เพิ่มทรัพย์สิน</Button> : null}
      </div>
      {loadError ? <p className="text-xs leading-5 text-status-danger">{loadError}</p> : null}
      {actionError ? <p className="text-xs leading-5 text-status-danger">{actionError}</p> : null}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((asset) => (
            <AssetCard key={asset.id} asset={asset} canManage={canManage} onEdit={openEdit} onRetire={handleRetire} />
          ))}
        </div>
        {!loading && filtered.length === 0 ? <p className="p-10 text-center text-xs leading-5 text-muted-foreground">ไม่พบทรัพย์สินที่ค้นหา</p> : null}
        {loading ? <p className="p-10 text-center text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p> : null}
      </div>
      {canManage ? <AssetFormDialog open={formOpen} asset={editingAsset} onClose={() => setFormOpen(false)} onSaved={handleSaved} /> : null}
    </section>
  );
}

export default AssetInventoryView;
