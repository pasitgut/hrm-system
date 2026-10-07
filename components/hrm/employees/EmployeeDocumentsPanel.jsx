"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  RiDeleteBinLine,
  RiDownloadLine,
  RiFileTextLine,
  RiShieldUserLine,
  RiUpload2Line,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_EMPLOYEE_DOCUMENT_BYTES } from "@/lib/employee-documents";
import { cn } from "@/lib/utils";

const ACCEPTED_FILE_TYPES = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png";

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatUploadedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
}

async function readPayload(response) {
  return response.json().catch(() => ({}));
}

export function EmployeeDocumentsPanel({ employeeId, canManage = false }) {
  const fileInputId = useId();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [notice, setNotice] = useState("");
  const [shareTarget, setShareTarget] = useState(null);
  const [shareDraft, setShareDraft] = useState([]);
  const [accountQuery, setAccountQuery] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [savingShare, setSavingShare] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadDocuments = useCallback(async ({ quiet = false, signal } = {}) => {
    if (!quiet) setLoading(true);
    setListError("");
    try {
      const response = await fetch(`/api/employees/${employeeId}/documents`, { cache: "no-store", signal });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || "โหลดเอกสารไม่สำเร็จ");
      setItems(payload.items || []);
    } catch (error) {
      if (error.name !== "AbortError") setListError(error.message || "โหลดเอกสารไม่สำเร็จ");
    } finally {
      if (!quiet && !signal?.aborted) setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setLoading(true);
    loadDocuments({ signal: controller.signal });
    return () => controller.abort();
  }, [employeeId, loadDocuments]);

  async function uploadFile(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setUploadError("");
    setNotice("");
    if (file.size <= 0) {
      setUploadError("ไฟล์เอกสารว่างเปล่า");
      return;
    }
    if (file.size > MAX_EMPLOYEE_DOCUMENT_BYTES) {
      setUploadError("ไฟล์เอกสารต้องมีขนาดไม่เกิน 15 MB");
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/employees/${employeeId}/documents`, { method: "POST", body });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || "อัปโหลดเอกสารไม่สำเร็จ");
      setNotice(`อัปโหลด ${payload.item.fileName} แล้ว`);
      await loadDocuments({ quiet: true });
    } catch (error) {
      setUploadError(error.message || "อัปโหลดเอกสารไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function openAccessEditor(item) {
    setNotice("");
    setShareError("");
    setDeleteTarget(null);
    setDeleteError("");
    setAccountQuery("");
    setShareTarget(item);
    setShareDraft(item.sharedWithUserIds || []);
    if (accountsLoaded || accountsLoading) return;

    setAccountsLoading(true);
    try {
      const response = await fetch("/api/employee-documents/users", { cache: "no-store" });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || "โหลดรายชื่อบัญชีไม่สำเร็จ");
      const eligibleAccounts = payload.items || [];
      const eligibleIds = new Set(eligibleAccounts.map((account) => account.id));
      setAccounts(eligibleAccounts);
      setShareDraft((current) => current.filter((id) => eligibleIds.has(id)));
      setAccountsLoaded(true);
    } catch (error) {
      setShareError(error.message || "โหลดรายชื่อบัญชีไม่สำเร็จ");
    } finally {
      setAccountsLoading(false);
    }
  }

  async function saveAccess() {
    if (!shareTarget) return;
    setSavingShare(true);
    setShareError("");
    setNotice("");
    try {
      const response = await fetch(`/api/employee-documents/${shareTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedWithUserIds: shareDraft }),
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || "บันทึกสิทธิ์เอกสารไม่สำเร็จ");
      setItems((current) => current.map((item) => item.id === shareTarget.id ? payload.item : item));
      setShareTarget(null);
      setNotice("บันทึกสิทธิ์การเข้าถึงแล้ว");
    } catch (error) {
      setShareError(error.message || "บันทึกสิทธิ์เอกสารไม่สำเร็จ");
    } finally {
      setSavingShare(false);
    }
  }

  async function deleteDocument() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/employee-documents/${deleteTarget.id}`, { method: "DELETE" });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || "ลบเอกสารไม่สำเร็จ");
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setNotice(`ลบ ${deleteTarget.fileName} แล้ว`);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error.message || "ลบเอกสารไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  }

  const sharedAccounts = useMemo(() => new Set(shareDraft), [shareDraft]);
  const visibleAccounts = useMemo(() => {
    const query = accountQuery.trim().toLocaleLowerCase("th");
    if (!query) return accounts;
    return accounts.filter((account) => (
      `${account.firstName} ${account.lastName} ${account.code} ${account.email}`
        .toLocaleLowerCase("th")
        .includes(query)
    ));
  }, [accounts, accountQuery]);

  return (
    <section aria-labelledby="employee-documents-heading" className="border-t border-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="employee-documents-heading" className="text-sm font-semibold text-foreground">เอกสารพนักงาน</h3>
          <p className="mt-1 text-xs text-muted-foreground">ไฟล์ PDF, Word, Excel, JPG หรือ PNG ขนาดไม่เกิน 15 MB</p>
        </div>
        {canManage ? (
          <div className="shrink-0">
            <label
              htmlFor={fileInputId}
              className={cn(
                "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                uploading && "pointer-events-none opacity-60",
              )}
            >
              <RiUpload2Line className="size-4" aria-hidden="true" />
              {uploading ? "กำลังอัปโหลด…" : "อัปโหลดเอกสาร"}
              <input
                id={fileInputId}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                className="sr-only"
                disabled={uploading}
                onChange={uploadFile}
                aria-label="เลือกเอกสารพนักงานเพื่ออัปโหลด"
              />
            </label>
          </div>
        ) : null}
      </div>

      {uploadError ? <p role="alert" className="mt-3 rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-sm text-status-danger">{uploadError}</p> : null}
      {listError ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-sm text-status-danger">
          <span>{listError}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => loadDocuments()}>ลองอีกครั้ง</Button>
        </div>
      ) : null}
      {notice ? <p role="status" className="mt-3 text-sm text-status-success">{notice}</p> : null}

      <div className="mt-2 divide-y divide-border">
        {loading ? <p className="py-4 text-sm text-muted-foreground">กำลังโหลดเอกสาร…</p> : null}
        {!loading && !listError && items.length === 0 ? (
          <div className="flex items-start gap-3 py-4">
            <RiFileTextLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{canManage ? "ยังไม่มีเอกสารสำหรับพนักงานคนนี้ เลือกไฟล์เพื่อเพิ่มเอกสารได้เลย" : "ยังไม่มีเอกสารที่คุณมีสิทธิ์เข้าถึงสำหรับพนักงานคนนี้"}</p>
          </div>
        ) : null}
        {items.map((item) => (
          <article key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <RiFileTextLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-foreground">{item.fileName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatBytes(item.fileSize)} <span aria-hidden="true">·</span> {formatUploadedAt(item.createdAt)}
                </p>
                {canManage ? <p className="mt-0.5 text-xs text-muted-foreground">กำหนดสิทธิ์ไว้ {item.sharedUserCount ?? item.sharedWithUserIds?.length ?? 0} บัญชี</p> : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              <Button asChild variant="ghost" size="icon" aria-label={`ดาวน์โหลด ${item.fileName}`}>
                <a href={`/api/employee-documents/${item.id}/file`}>
                  <RiDownloadLine aria-hidden="true" />
                </a>
              </Button>
              {canManage ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    leadingIcon={RiShieldUserLine}
                    aria-label={`จัดการสิทธิ์ ${item.fileName}`}
                    onClick={() => openAccessEditor(item)}
                  >
                    สิทธิ์
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-status-danger hover:text-status-danger"
                    aria-label={`ลบ ${item.fileName}`}
                    disabled={Boolean(deleteTarget) || savingShare}
                    onClick={() => { setDeleteTarget(item); setDeleteError(""); setShareTarget(null); }}
                  >
                    <RiDeleteBinLine aria-hidden="true" />
                  </Button>
                </>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {shareTarget ? (
        <div role="region" aria-labelledby="document-access-title" className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 id="document-access-title" className="text-sm font-semibold text-foreground">กำหนดสิทธิ์เข้าถึง</h4>
              <p className="mt-0.5 break-words text-xs text-muted-foreground">{shareTarget.fileName}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setShareTarget(null); setShareError(""); }}>ปิด</Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">เลือกบัญชีที่มีสิทธิ์ดูเอกสารพนักงานในหน้าตั้งค่า บัญชีอื่นจะดาวน์โหลดไฟล์นี้ไม่ได้ ผู้จัดการเอกสารยังเข้าถึงได้ทุกไฟล์</p>
          {accountsLoading ? <p className="py-2 text-sm text-muted-foreground">กำลังโหลดบัญชี…</p> : null}
          {!accountsLoading && accountsLoaded && accounts.length === 0 ? (
            <p className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">ยังไม่มีบัญชีที่ได้รับสิทธิ์ดูเอกสารพนักงาน</p>
          ) : null}
          {!accountsLoading && accounts.length > 0 ? (
            <>
              {accounts.length > 5 ? <Input label="ค้นหาบัญชี" value={accountQuery} onChange={setAccountQuery} placeholder="ชื่อ รหัสพนักงาน หรืออีเมล" /> : null}
              <fieldset className="max-h-56 space-y-1 overflow-y-auto border-y border-border py-2">
                <legend className="sr-only">บัญชีผู้ใช้ที่มีสิทธิ์ดูเอกสารพนักงาน</legend>
                {visibleAccounts.map((account) => {
                const name = `${account.firstName} ${account.lastName}`.trim();
                return (
                  <label key={account.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-background">
                    <input
                      type="checkbox"
                      checked={sharedAccounts.has(account.id)}
                      onChange={(event) => setShareDraft((current) => event.target.checked
                        ? [...new Set([...current, account.id])]
                        : current.filter((id) => id !== account.id))}
                      className="size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{name || account.email}</span>
                      <span className="block truncate text-xs text-muted-foreground">{account.code} · {account.email}</span>
                    </span>
                  </label>
                );
                })}
                {visibleAccounts.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">ไม่พบบัญชีที่ค้นหา</p> : null}
              </fieldset>
            </>
          ) : null}
          {shareError ? <p role="alert" className="text-sm text-status-danger">{shareError}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {shareError && !accountsLoaded ? <Button type="button" variant="outline" disabled={accountsLoading || savingShare} onClick={() => openAccessEditor(shareTarget)}>ลองโหลดรายชื่ออีกครั้ง</Button> : null}
            <Button type="button" variant="outline" disabled={savingShare} onClick={() => { setShareTarget(null); setShareError(""); }}>ยกเลิก</Button>
            <Button type="button" disabled={savingShare || accountsLoading} onClick={saveAccess}>{savingShare ? "กำลังบันทึก…" : "บันทึกสิทธิ์"}</Button>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-3">
          <p className="min-w-0 flex-1 text-sm text-foreground">ยืนยันลบ <strong className="break-words">{deleteTarget.fileName}</strong> หรือไม่? ไฟล์จะถูกลบออกจากระบบ</p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" variant="outline" disabled={deleting} onClick={() => { setDeleteTarget(null); setDeleteError(""); }}>ยกเลิก</Button>
            <Button type="button" size="sm" variant="destructive" disabled={deleting} onClick={deleteDocument}>{deleting ? "กำลังลบ…" : "ลบเอกสาร"}</Button>
          </div>
          {deleteError ? <p role="alert" className="w-full text-sm text-status-danger">{deleteError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
