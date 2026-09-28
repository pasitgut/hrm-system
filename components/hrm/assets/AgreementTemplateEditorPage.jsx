"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgreementDocxEditor } from "@/components/hrm/assets/AgreementDocxEditor";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COMPANY_BORROW_AGREEMENT } from "@/asset-borrowing/presets/companyAgreements";
import { canManageAssets } from "@/lib/auth/permissions";

function defaultTemplate() {
  return { title: COMPANY_BORROW_AGREEMENT.title, header: COMPANY_BORROW_AGREEMENT.header, body: COMPANY_BORROW_AGREEMENT.body, footer: COMPANY_BORROW_AGREEMENT.footer, isActive: true };
}

export default function AgreementTemplateEditorPage({ templateId = null }) {
  const router = useRouter();
  const roleContext = useHrmRole();
  const manager = Boolean(roleContext?.role && canManageAssets(roleContext.role));
  const isNew = !templateId;
  const initialValues = useRef(null);
  const [title, setTitle] = useState("");
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (isNew) {
        const value = defaultTemplate();
        setTitle(value.title); setHeader(value.header); setBody(value.body); setFooter(value.footer); setIsActive(true);
        initialValues.current = value;
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`/api/asset-agreement-templates/${templateId}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.item) throw new Error(payload.error || "ไม่สามารถโหลด Agreement ได้");
        if (cancelled) return;
        const value = payload.item;
        const initial = { title: value.title, header: value.header || "", body: value.body, footer: value.footer || "", isActive: value.isActive };
        setTitle(initial.title); setHeader(initial.header); setBody(initial.body); setFooter(initial.footer); setIsActive(initial.isActive);
        initialValues.current = initial;
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "ไม่สามารถโหลด Agreement ได้");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [templateId, isNew]);

  const dirty = useMemo(() => {
    const original = initialValues.current;
    return Boolean(original && (original.title !== title || original.header !== header || original.body !== body || original.footer !== footer || original.isActive !== isActive));
  }, [title, header, body, footer, isActive]);

  function confirmExit(event) {
    if (dirty && !window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากเอกสารหรือไม่?")) event.preventDefault();
  }

  async function save() {
    if (!title.trim() || !body.trim()) { setError("กรุณากรอกชื่อและเนื้อหา Agreement"); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch(isNew ? "/api/asset-agreement-templates" : `/api/asset-agreement-templates/${templateId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "borrow", title, header, body, footer, isActive }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.item) throw new Error(payload.error || "บันทึก Agreement ไม่สำเร็จ");
      router.push("/assets/agreements");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึก Agreement ไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  return (
    <main className="flex min-h-dvh min-w-0 flex-col bg-muted">
      <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><Link href="/assets/agreements" onClick={confirmExit} className="inline-flex min-h-10 shrink-0 items-center rounded-sm px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">← <span className="ml-1.5">กลับ Agreement</span></Link><span className="hidden h-8 border-l border-border sm:block" aria-hidden="true" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{title || "สร้าง Agreement"}</p><p className="text-xs text-muted-foreground">เอกสารต้นแบบสำหรับแนบกับคำขอยืม</p></div></div>
        <div className="flex shrink-0 items-center gap-2">{dirty ? <span className="hidden text-xs text-muted-foreground sm:inline">มีการแก้ไขที่ยังไม่บันทึก</span> : null}<Button type="button" variant="outline" disabled={saving} onClick={() => { if (!dirty || window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากเอกสารหรือไม่?")) router.push("/assets/agreements"); }}>ยกเลิก</Button><Button type="button" disabled={!manager || loading || saving || !dirty} onClick={() => void save()}>{saving ? "กำลังบันทึก…" : "บันทึก Agreement"}</Button></div>
      </header>
      <div className="grid min-w-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
          {loading ? <div className="grid min-h-80 place-items-center p-6 text-sm text-muted-foreground" role="status">กำลังโหลด Agreement…</div> : null}
          {!loading ? <AgreementDocxEditor key={templateId || "new-template"} requestId={templateId || "new-template"} body={body} title={title} documentDate="" onBodyChange={setBody} onTitleChange={setTitle} onDocumentDateChange={() => {}} hideDocumentDate readOnly={!manager} /> : null}
        </div>
        <aside className="min-w-0 space-y-4 bg-background p-4 sm:p-5">
          <div><h1 className="text-sm font-semibold">ส่วนหัวและท้ายเอกสาร</h1><p className="mt-1 text-xs leading-5 text-muted-foreground">รูปหัวเอกสารใช้งานจาก public/download.png และเนื้อหาจะถูกบันทึกเป็นสำเนาเมื่อแนบกับคำขอ</p></div>
          <Textarea label="HTML ส่วนหัว" rows={5} value={header} disabled={!manager || loading || saving} onChange={(event) => setHeader(event.target.value)} />
          <Textarea label="HTML ส่วนท้าย" rows={4} value={footer} disabled={!manager || loading || saving} onChange={(event) => setFooter(event.target.value)} />
          <div className="flex items-start gap-3 border-t border-border pt-4"><input id="agreement-template-active" type="checkbox" className="mt-0.5 size-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" checked={isActive} disabled={!manager || loading || saving} onChange={(event) => setIsActive(event.target.checked)} /><label htmlFor="agreement-template-active" className="text-sm">เปิดให้เลือกตอนสร้างคำขอ</label></div>
          {!manager ? <p className="text-sm leading-6 text-status-danger" role="alert">หน้านี้สำหรับหัวหน้างานหรือผู้บริหารเท่านั้น</p> : null}
          {error ? <p className="text-sm leading-6 text-status-danger" role="alert">{error}</p> : null}
        </aside>
      </div>
    </main>
  );
}
