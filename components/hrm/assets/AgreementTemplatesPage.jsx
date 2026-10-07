"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RiAddLine, RiFileList3Line, RiRefreshLine } from "@remixicon/react";
import { PageHeader } from "@/components/hrm/PageHeader";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { canManageAssetTemplates } from "@/lib/auth/permissions";

export default function AgreementTemplatesPage() {
  const user = useHrmRole();
  const manager = Boolean(user && canManageAssetTemplates(user.permissions));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/asset-agreement-templates");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "ไม่สามารถโหลด Agreement ได้");
      setItems(payload.items || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "ไม่สามารถโหลด Agreement ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function setActive(template, isActive) {
    setBusyId(template.id);
    setError("");
    try {
      const response = await fetch(`/api/asset-agreement-templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "เปลี่ยนสถานะ Agreement ไม่สำเร็จ");
      setItems((current) => current.map((item) => item.id === template.id ? payload.item : item));
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "เปลี่ยนสถานะ Agreement ไม่สำเร็จ");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People operations"
        title="Agreement"
        description="จัดการเอกสารต้นแบบแยกจากคำขอยืม เมื่อแนบกับคำขอ ระบบจะเก็บสำเนาเอกสารฉบับนั้นไว้กับรายการ"
        actions={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/assets">กลับรายการยืม</Link></Button>{manager ? <Button asChild leadingIcon={RiAddLine}><Link href="/assets/agreements/new">สร้าง Agreement</Link></Button> : null}</div>}
      />
      {!manager ? <p role="alert" className="border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">บัญชีนี้ไม่มีสิทธิ์จัดการทรัพย์สิน</p> : null}
      {error ? <p role="alert" className="text-sm text-status-danger">{error}</p> : null}
      <section className="overflow-hidden border border-border bg-card" aria-label="รายการ Agreement ต้นแบบ">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-4 py-3 sm:px-5">
          <div><h2 className="text-sm font-semibold">เอกสารต้นแบบ</h2><p className="mt-1 text-xs text-muted-foreground">แก้ไขต้นแบบจะไม่เปลี่ยนเอกสารที่แนบกับคำขอไปแล้ว</p></div>
          <Button type="button" variant="ghost" size="icon" leadingIcon={RiRefreshLine} aria-label="รีเฟรช Agreement" disabled={loading} onClick={() => void refresh()} />
        </div>
        {loading ? <p className="p-8 text-center text-sm text-muted-foreground">กำลังโหลดรายการ…</p> : null}
        {!loading && !items.length ? <div className="grid min-h-40 place-content-center gap-2 px-4 text-center"><RiFileList3Line className="mx-auto size-5 text-muted-foreground" aria-hidden /><p className="text-sm font-medium">ยังไม่มี Agreement ต้นแบบ</p><p className="text-xs text-muted-foreground">สร้างเอกสารต้นแบบเพื่อให้หัวหน้างานเลือกแนบกับคำขอยืมได้</p>{manager ? <Button asChild size="sm" className="mx-auto"><Link href="/assets/agreements/new">สร้าง Agreement</Link></Button> : null}</div> : null}
        {!loading && items.length ? <ul className="divide-y divide-border">
          {items.map((item) => <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold">{item.title}</h3><StatusBadge status={item.isActive ? "approved" : "unknown"}>{item.isActive ? "ใช้งาน" : "ปิดใช้งาน"}</StatusBadge></div><p className="mt-1 text-xs text-muted-foreground">แก้ไขล่าสุด {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(item.updatedAt))} · {item.createdBy || "ไม่ระบุผู้สร้าง"}</p></div>
            <div className="flex flex-wrap items-center gap-2"><Button asChild size="sm" variant="outline"><Link href={`/assets/agreements/${item.id}/edit`}>แก้ไข</Link></Button><Button type="button" size="sm" variant="ghost" disabled={busyId === item.id} onClick={() => void setActive(item, !item.isActive)}>{busyId === item.id ? "กำลังบันทึก…" : item.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}</Button></div>
          </li>)}
        </ul> : null}
      </section>
    </div>
  );
}
