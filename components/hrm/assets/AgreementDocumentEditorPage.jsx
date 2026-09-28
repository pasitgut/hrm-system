"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgreementDocxEditor } from "@/components/hrm/assets/AgreementDocxEditor";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { Button } from "@/components/ui/button";
import { canEditAgreement } from "@/asset-borrowing/domain/asset";
import { canManageAssets } from "@/lib/auth/permissions";

function dateText(value) {
  if (!value) return "ไม่ระบุ";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function agreementStatusText(status) {
  return ({
    waitingHandover: "รอลงชื่อผู้ส่งมอบ",
    waitingEmployee: "รอลงชื่อผู้ยืม",
    waitingAdmin: "รอผู้อนุมัติลงชื่อ",
    completed: "ลงชื่อครบแล้ว",
  })[status] || "ไม่มีข้อตกลง";
}

export default function AgreementDocumentEditorPage({ requestId }) {
  const router = useRouter();
  const roleContext = useHrmRole();
  const manager = Boolean(roleContext?.role && canManageAssets(roleContext.role));
  const initialValues = useRef(null);
  const [item, setItem] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadRequest() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/asset-requests/${requestId}`, { signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.item) throw new Error(payload.error || "ไม่สามารถโหลดเอกสารได้");
        const current = payload.item;
        const nextValues = {
          title: current.agreement?.title || "",
          body: current.agreement?.body || "",
        };
        setItem(current);
        setTitle(nextValues.title);
        setBody(nextValues.body);
        initialValues.current = nextValues;
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "ไม่สามารถโหลดเอกสารได้");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadRequest();
    return () => controller.abort();
  }, [requestId]);

  const agreement = item?.agreement;
  const hasSignedAgreement = Boolean(agreement?.signatureBoxes?.some((box) => box.status === "signed"));
  const editable = Boolean(manager && agreement && canEditAgreement(
    true,
    true,
    agreement.status,
    hasSignedAgreement,
  ));
  const dirty = useMemo(() => {
    if (!initialValues.current) return false;
    return initialValues.current.title !== title || initialValues.current.body !== body;
  }, [title, body]);

  function confirmExit(event) {
    if (dirty && !window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากเอกสารหรือไม่?")) event.preventDefault();
  }

  async function save() {
    if (!item || !agreement || !title.trim() || !body.trim() || !agreement.documentDate) {
      setError("กรุณากรอกชื่อเอกสารและเนื้อหาให้ครบ");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/asset-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveAgreement",
          agreement: { ...agreement, title, body, updatedAt: null },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "บันทึกเอกสารไม่สำเร็จ กรุณาลองอีกครั้ง");
      window.dispatchEvent(new Event("asset-requests:refresh"));
      router.push("/assets");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกเอกสารไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex h-dvh min-w-0 flex-col overflow-hidden bg-muted">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/assets"
            onClick={confirmExit}
            className="inline-flex min-h-10 shrink-0 items-center rounded-sm px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ← <span className="ml-1.5">กลับ</span>
          </Link>
          <span className="hidden h-8 border-l border-border sm:block" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{title || "แก้ไข Agreement"}</p>
            <p className="text-xs text-muted-foreground">พื้นที่แก้ไขเอกสาร</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {dirty ? <span className="hidden text-xs text-muted-foreground sm:inline">มีการแก้ไขที่ยังไม่บันทึก</span> : null}
          <Button type="button" variant="outline" disabled={saving} onClick={(event) => {
            if (dirty && !window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากเอกสารหรือไม่?")) return;
            router.push("/assets");
          }}>
            ยกเลิก
          </Button>
          <Button type="button" disabled={!editable || loading || saving || !dirty} onClick={() => void save()}>
            {saving ? "กำลังบันทึก…" : "บันทึกเอกสาร"}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_11rem] lg:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-h-0 min-w-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          {loading ? <div className="grid min-h-0 flex-1 place-items-center p-6 text-sm text-muted-foreground" role="status">กำลังโหลดเอกสาร…</div> : null}
          {!loading && agreement ? (
            <AgreementDocxEditor
              key={requestId}
              requestId={requestId}
              body={body}
              title={title}
              documentDate={agreement.documentDate}
              onBodyChange={setBody}
              onTitleChange={setTitle}
              onDocumentDateChange={() => {}}
              hideDocumentDateInput
              readOnly={!editable}
            />
          ) : null}
          {!loading && !agreement && !error ? <p className="p-6 text-sm text-muted-foreground">คำขอนี้ไม่มี Agreement</p> : null}
        </div>

        <aside className="min-h-0 min-w-0 overflow-y-auto bg-background p-4 sm:p-5">
          {item ? <>
            <div className="border-b border-border pb-4">
              <p className="text-xs font-medium text-muted-foreground">ผู้ยืม</p>
              <h1 className="mt-1 text-base font-semibold text-foreground">{item.employeeName}</h1>
              <p className="mt-1 text-xs text-muted-foreground">รหัส {item.employeeCode} · {item.position || "ไม่ระบุตำแหน่ง"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.department || "ไม่ระบุแผนก"}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-4 border-b border-border py-4 text-xs">
              <div><dt className="text-muted-foreground">วันที่เริ่มยืม</dt><dd className="mt-1 text-foreground">{dateText(item.fromDate)}</dd></div>
              <div><dt className="text-muted-foreground">กำหนดคืน</dt><dd className="mt-1 text-foreground">{dateText(item.toDate)}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">สถานะ Agreement</dt><dd className="mt-1 text-foreground">{agreementStatusText(agreement?.status)}</dd></div>
            </dl>
          </> : null}
          {!loading && !manager ? <p className="mt-4 text-sm leading-6 text-status-danger" role="alert">หน้านี้สำหรับหัวหน้างานหรือผู้บริหารเท่านั้น</p> : null}
          {!loading && manager && agreement && !editable ? <p className="mt-4 text-xs leading-5 text-muted-foreground">เอกสารนี้แก้ไขไม่ได้หลังเริ่มลงนามหรืออนุมัติแล้ว</p> : null}
          {error ? <p className="mt-4 text-sm leading-6 text-status-danger" role="alert">{error}</p> : null}
          {editable ? <p className="mt-5 text-xs leading-5 text-muted-foreground">แก้ไขได้เฉพาะชื่อและเนื้อหา Agreement</p> : null}
        </aside>
      </div>
    </main>
  );
}
