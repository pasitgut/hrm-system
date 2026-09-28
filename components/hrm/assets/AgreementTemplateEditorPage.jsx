"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgreementDocxEditor } from "@/components/hrm/assets/AgreementDocxEditor";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { Button } from "@/components/ui/button";
import { COMPANY_BORROW_AGREEMENT } from "@/asset-borrowing/presets/companyAgreements";
import { canManageAssets } from "@/lib/auth/permissions";

function defaultTemplate() {
  return { title: COMPANY_BORROW_AGREEMENT.title, body: COMPANY_BORROW_AGREEMENT.body };
}

export default function AgreementTemplateEditorPage({ templateId = null }) {
  const router = useRouter();
  const roleContext = useHrmRole();
  const manager = Boolean(roleContext?.role && canManageAssets(roleContext.role));
  const isNew = !templateId;
  const initialValues = useRef(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (isNew) {
        const value = defaultTemplate();
        setTitle(value.title); setBody(value.body);
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
        const initial = { title: value.title, body: value.body };
        setTitle(initial.title); setBody(initial.body);
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
    return Boolean(original && (original.title !== title || original.body !== body));
  }, [title, body]);

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
        body: JSON.stringify({ type: "borrow", title, header: COMPANY_BORROW_AGREEMENT.header, body, footer: COMPANY_BORROW_AGREEMENT.footer }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.item) throw new Error(payload.error || "บันทึก Agreement ไม่สำเร็จ");
      router.push("/assets/agreements");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึก Agreement ไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  return (
    <main className="flex h-dvh min-w-0 flex-col overflow-hidden bg-muted">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><Link href="/assets/agreements" onClick={confirmExit} className="inline-flex min-h-10 shrink-0 items-center rounded-sm px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">← <span className="ml-1.5">กลับ Agreement</span></Link><span className="hidden h-8 border-l border-border sm:block" aria-hidden="true" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{title || "สร้าง Agreement"}</p><p className="text-xs text-muted-foreground">เอกสารต้นแบบสำหรับแนบกับคำขอยืม</p></div></div>
        <div className="flex shrink-0 items-center gap-2">{dirty ? <span className="hidden text-xs text-muted-foreground sm:inline">มีการแก้ไขที่ยังไม่บันทึก</span> : null}<Button type="button" variant="outline" disabled={saving} onClick={() => { if (!dirty || window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากเอกสารหรือไม่?")) router.push("/assets/agreements"); }}>ยกเลิก</Button><Button type="button" disabled={!manager || loading || saving || !dirty} onClick={() => void save()}>{saving ? "กำลังบันทึก…" : "บันทึก Agreement"}</Button></div>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!manager ? <p className="border-b border-border bg-background px-4 py-3 text-sm leading-6 text-status-danger" role="alert">หน้านี้สำหรับหัวหน้างานหรือผู้บริหารเท่านั้น</p> : null}
          {error ? <p className="border-b border-border bg-background px-4 py-3 text-sm leading-6 text-status-danger" role="alert">{error}</p> : null}
          {loading ? <div className="grid min-h-0 flex-1 place-items-center p-6 text-sm text-muted-foreground" role="status">กำลังโหลด Agreement…</div> : null}
          {!loading ? <AgreementDocxEditor key={templateId || "new-template"} requestId={templateId || "new-template"} body={body} title={title} documentDate="" onBodyChange={setBody} onTitleChange={setTitle} onDocumentDateChange={() => {}} hideDocumentDate readOnly={!manager} /> : null}
        </div>
      </div>
    </main>
  );
}
