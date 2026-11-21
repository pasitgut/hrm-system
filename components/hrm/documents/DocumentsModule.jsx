"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  RiDeleteBinLine,
  RiDownloadLine,
  RiFileTextLine,
  RiRefreshLine,
  RiSearchLine,
  RiShieldUserLine,
  RiUpload2Line,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Table } from "@/components/ui/table";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { PageHeader } from "@/components/hrm/PageHeader";
import { IntegrationFeatureNotice } from "@/components/hrm/IntegrationNotice";
import { useHrmIntegrations, useHrmRole } from "@/components/hrm/HrmShell";
import {
  canDeleteEmployeeDocuments,
  canShareEmployeeDocuments,
  canUploadEmployeeDocuments,
} from "@/lib/auth/permissions";
import { MAX_EMPLOYEE_DOCUMENT_BYTES, MAX_EMPLOYEE_DOCUMENT_MB } from "@/lib/employee-documents";
import { uploadEmployeeDocument } from "@/lib/client/upload-employee-document";
import { cn } from "@/lib/utils";

const ACCEPTED_FILE_TYPES = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png";
const ALL_FILTER_VALUE = "all";

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function extensionOf(fileName) {
  return fileName.split(".").at(-1)?.toLocaleLowerCase("en-US") || "";
}

async function readPayload(response) {
  return response.json().catch(() => ({}));
}

function Feedback({ children, danger = false }) {
  return (
    <p
      role={danger ? "alert" : "status"}
      className={cn("text-sm", danger ? "text-status-danger" : "text-status-success")}
    >
      {children}
    </p>
  );
}

function DocumentActions({ item, canShare, canDelete, onShare, onDelete }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button asChild variant="ghost" size="icon" aria-label={`ดาวน์โหลด ${item.fileName}`}>
        <a href={`/api/employee-documents/${item.id}/file`}>
          <RiDownloadLine aria-hidden="true" />
        </a>
      </Button>
      {canShare ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            leadingIcon={RiShieldUserLine}
            onClick={() => onShare(item)}
          >
            สิทธิ์
          </Button>
      ) : null}
      {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-status-danger hover:text-status-danger"
            aria-label={`ลบ ${item.fileName}`}
            onClick={() => onDelete(item)}
          >
            <RiDeleteBinLine aria-hidden="true" />
          </Button>
      ) : null}
    </div>
  );
}

export default function DocumentsModule() {
  const { permissions = [] } = useHrmRole() || {};
  const { googleDrive: googleDriveReady } = useHrmIntegrations();
  const canUpload = canUploadEmployeeDocuments(permissions);
  const canShare = canShareEmployeeDocuments(permissions);
  const canDelete = canDeleteEmployeeDocuments(permissions);
  const employeeSelectId = useId();
  const typeSelectId = useId();
  const uploadEmployeeSelectId = useId();
  const uploadFileId = useId();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState(ALL_FILTER_VALUE);
  const [typeFilter, setTypeFilter] = useState(ALL_FILTER_VALUE);

  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadEmployeeId, setUploadEmployeeId] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  const [shareTarget, setShareTarget] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountQuery, setAccountQuery] = useState("");
  const [shareDraft, setShareDraft] = useState([]);
  const [shareError, setShareError] = useState("");
  const [savingShare, setSavingShare] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadDocuments = useCallback(async ({ quiet = false, signal } = {}) => {
    if (!quiet) setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/employee-documents", { cache: "no-store", signal });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || "โหลดเอกสารไม่สำเร็จ");
      setItems(payload.items || []);
    } catch (error) {
      if (error.name !== "AbortError") setLoadError(error.message || "โหลดเอกสารไม่สำเร็จ");
    } finally {
      if (!quiet && !signal?.aborted) setLoading(false);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    setEmployeesError("");
    try {
      const response = await fetch("/api/employee-documents/employees", { cache: "no-store" });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || "โหลดรายชื่อพนักงานไม่สำเร็จ");
      setEmployees(payload.items || []);
    } catch (error) {
      setEmployeesError(error.message || "โหลดรายชื่อพนักงานไม่สำเร็จ");
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setShareError("");
    try {
      const response = await fetch("/api/employee-documents/users", { cache: "no-store" });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || "โหลดรายชื่อบัญชีไม่สำเร็จ");
      setAccounts(payload.items || []);
      setAccountsLoaded(true);
    } catch (error) {
      setShareError(error.message || "โหลดรายชื่อบัญชีไม่สำเร็จ");
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadDocuments({ signal: controller.signal });
    return () => controller.abort();
  }, [loadDocuments]);

  useEffect(() => {
    if (canUpload) loadEmployees();
  }, [canUpload, loadEmployees]);

  const employeeOptions = useMemo(() => {
    const unique = new Map();
    for (const item of items) {
      if (!unique.has(item.employeeId)) {
        unique.set(item.employeeId, {
          id: item.employeeId,
          code: item.employeeCode,
          name: item.employeeName,
        });
      }
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [items]);

  const typeOptions = useMemo(() => [...new Set(items.map((item) => extensionOf(item.fileName)).filter(Boolean))].sort(), [items]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    return items.filter((item) => {
      if (employeeFilter !== ALL_FILTER_VALUE && item.employeeId !== employeeFilter) return false;
      if (typeFilter !== ALL_FILTER_VALUE && extensionOf(item.fileName) !== typeFilter) return false;
      if (!normalizedQuery) return true;
      return `${item.fileName} ${item.employeeName} ${item.employeeCode} ${item.departmentName || ""}`
        .toLocaleLowerCase("th")
        .includes(normalizedQuery);
    });
  }, [items, query, employeeFilter, typeFilter]);

  const selectedAccounts = useMemo(() => new Set(shareDraft), [shareDraft]);
  const visibleAccounts = useMemo(() => {
    const normalizedQuery = accountQuery.trim().toLocaleLowerCase("th");
    if (!normalizedQuery) return accounts;
    return accounts.filter((account) => (
      `${account.firstName} ${account.lastName} ${account.code} ${account.email}`
        .toLocaleLowerCase("th")
        .includes(normalizedQuery)
    ));
  }, [accounts, accountQuery]);

  async function openUpload() {
    setNotice("");
    setUploadError("");
    setUploadEmployeeId(employees.length === 1 ? employees[0].id : "");
    setUploadFile(null);
    setUploadOpen(true);
    if (!employees.length && !employeesLoading) await loadEmployees();
  }

  function handleUploadFileChange(event) {
    const file = event.currentTarget.files?.[0] || null;
    event.currentTarget.value = "";
    setUploadError("");
    setUploadFile(file);
    if (file && file.size > MAX_EMPLOYEE_DOCUMENT_BYTES) {
      setUploadError(`ไฟล์เอกสารต้องมีขนาดไม่เกิน ${MAX_EMPLOYEE_DOCUMENT_MB} MB`);
    } else if (file && file.size <= 0) {
      setUploadError("ไฟล์เอกสารว่างเปล่า");
    }
  }

  async function uploadDocument(event) {
    event.preventDefault();
    setUploadError("");
    setNotice("");
    if (!uploadEmployeeId) {
      setUploadError("กรุณาเลือกพนักงาน");
      return;
    }
    if (!uploadFile) {
      setUploadError("กรุณาเลือกไฟล์เอกสาร");
      return;
    }
    if (uploadFile.size <= 0) {
      setUploadError("ไฟล์เอกสารว่างเปล่า");
      return;
    }
    if (uploadFile.size > MAX_EMPLOYEE_DOCUMENT_BYTES) {
      setUploadError(`ไฟล์เอกสารต้องมีขนาดไม่เกิน ${MAX_EMPLOYEE_DOCUMENT_MB} MB`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const item = await uploadEmployeeDocument(uploadEmployeeId, uploadFile, {
        onProgress: ({ percent }) => setUploadProgress(percent),
      });
      setUploadOpen(false);
      setUploadFile(null);
      setNotice(`อัปโหลด ${item.fileName} แล้ว`);
      await loadDocuments({ quiet: true });
    } catch (error) {
      setUploadError(error.message || "อัปโหลดเอกสารไม่สำเร็จ");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function openShareEditor(item) {
    setNotice("");
    setDeleteTarget(null);
    setShareTarget(item);
    setShareDraft(item.sharedWithUserIds || []);
    setAccountQuery("");
    setShareError("");
    if (!accountsLoaded) await loadAccounts();
  }

  async function saveShareAccess() {
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
      setItems((current) => current.map((item) => item.id === shareTarget.id ? { ...item, ...payload.item } : item));
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
      setDeleteTarget(null);
      setNotice(`ลบ ${deleteTarget.fileName} แล้ว`);
    } catch (error) {
      setDeleteError(error.message || "ลบเอกสารไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  }

  const pageActions = canUpload ? (
    <Button
      type="button"
      leadingIcon={RiUpload2Line}
      onClick={openUpload}
      disabled={employeesLoading || !googleDriveReady}
      title={!googleDriveReady ? "ยังไม่ได้ตั้งค่า Google Drive" : undefined}
    >
      อัปโหลดเอกสาร
    </Button>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ข้อมูลและไฟล์พนักงาน"
        title="เอกสาร"
        description="ค้นหาและจัดการเอกสารพนักงานจากที่เดียว"
        actions={pageActions}
      />

      <IntegrationFeatureNotice service="googleDrive" />

      {notice ? <Feedback>{notice}</Feedback> : null}

      <section aria-label="รายการเอกสารพนักงาน" className="space-y-4">
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(220px,1fr)_minmax(180px,0.7fr)_minmax(140px,0.45fr)]">
          <Input
            label="ค้นหา"
            leadingIcon={RiSearchLine}
            value={query}
            onChange={setQuery}
            placeholder="ชื่อไฟล์ ชื่อ หรือรหัสพนักงาน"
          />
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor={employeeSelectId} className="text-sm font-medium leading-none">พนักงาน</label>
            <Select
              id={employeeSelectId}
              aria-label="กรองตามพนักงาน"
              selectedKey={employeeFilter}
              onSelectionChange={setEmployeeFilter}
            >
              <SelectItem id={ALL_FILTER_VALUE}>พนักงานทั้งหมด</SelectItem>
              {employeeOptions.map((employee) => (
                <SelectItem key={employee.id} id={employee.id}>
                  {employee.code} · {employee.name}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor={typeSelectId} className="text-sm font-medium leading-none">ชนิดไฟล์</label>
            <Select
              id={typeSelectId}
              aria-label="กรองตามชนิดไฟล์"
              selectedKey={typeFilter}
              onSelectionChange={setTypeFilter}
            >
              <SelectItem id={ALL_FILTER_VALUE}>ทุกชนิด</SelectItem>
              {typeOptions.map((extension) => (
                <SelectItem key={extension} id={extension}>{extension.toUpperCase()}</SelectItem>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {loading ? "กำลังโหลดเอกสาร…" : `แสดง ${visibleItems.length.toLocaleString("th-TH")} จาก ${items.length.toLocaleString("th-TH")} เอกสาร`}
          </p>
          {query || employeeFilter !== ALL_FILTER_VALUE || typeFilter !== ALL_FILTER_VALUE ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setQuery(""); setEmployeeFilter(ALL_FILTER_VALUE); setTypeFilter(ALL_FILTER_VALUE); }}
            >
              ล้างตัวกรอง
            </Button>
          ) : null}
        </div>

        {loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-y border-status-danger/30 py-3 text-sm">
            <span className="text-status-danger">{loadError}</span>
            <Button type="button" variant="outline" size="sm" leadingIcon={RiRefreshLine} onClick={() => loadDocuments()}>
              โหลดอีกครั้ง
            </Button>
          </div>
        ) : null}

        {!loading && !loadError && visibleItems.length === 0 ? (
          <div className="flex flex-col items-start gap-3 border-y border-border py-7">
            <div className="flex items-start gap-3">
              <RiFileTextLine className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {items.length ? "ไม่พบเอกสารที่ตรงกับตัวกรอง" : "ยังไม่มีเอกสารที่เปิดดูได้"}
                </h2>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  {items.length
                    ? "ลองค้นด้วยคำอื่น หรือปรับตัวกรองพนักงานและชนิดไฟล์"
                    : canUpload
                      ? "เพิ่มเอกสารให้พนักงานได้จากปุ่มอัปโหลดด้านบน"
                      : "เอกสารจะแสดงที่นี่เมื่อผู้จัดการแชร์สิทธิ์ให้บัญชีของคุณ"}
                </p>
              </div>
            </div>
            {!items.length && canUpload ? (
              <Button type="button" variant="outline" leadingIcon={RiUpload2Line} onClick={openUpload} disabled={employeesLoading}>
                อัปโหลดเอกสาร
              </Button>
            ) : null}
          </div>
        ) : null}

        {visibleItems.length > 0 ? (
          <>
            <div className="hidden md:block">
              <Table className="min-w-[820px]">
                <caption className="sr-only">เอกสารพนักงานที่บัญชีนี้เปิดดูได้</caption>
                <thead>
                  <tr>
                    <th scope="col">เอกสาร</th>
                    <th scope="col">พนักงาน</th>
                    <th scope="col">วันที่เพิ่ม</th>
                    {canShare ? <th scope="col">สิทธิ์เข้าถึง</th> : null}
                    <th scope="col" className="text-right">การทำงาน</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="flex min-w-0 items-start gap-2.5">
                          <RiFileTextLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="max-w-[24rem] break-words text-sm font-medium text-foreground">{item.fileName}</p>
                            <p className="mt-0.5 text-xs uppercase text-muted-foreground">
                              {extensionOf(item.fileName)} · {formatBytes(item.fileSize)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className="max-w-56 break-words text-sm font-medium text-foreground">{item.employeeName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.employeeCode}{item.departmentName ? ` · ${item.departmentName}` : ""}{!item.employeeIsActive ? " · พ้นสภาพ" : ""}
                        </p>
                      </td>
                      <td className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(item.createdAt)}</td>
                      {canShare ? <td className="whitespace-nowrap text-sm text-muted-foreground">แชร์ {item.sharedUserCount ?? 0} บัญชี</td> : null}
                      <td>
                        <DocumentActions item={item} canShare={canShare} canDelete={canDelete} onShare={openShareEditor} onDelete={(target) => { setDeleteError(""); setShareTarget(null); setDeleteTarget(target); }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <div className="divide-y divide-border border-y border-border md:hidden">
              {visibleItems.map((item) => (
                <article key={item.id} className="space-y-2.5 py-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <RiFileTextLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-foreground">{item.fileName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.employeeName} · {item.employeeCode}{item.departmentName ? ` · ${item.departmentName}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {extensionOf(item.fileName).toUpperCase()} · {formatBytes(item.fileSize)} · {formatDate(item.createdAt)}
                        {!item.employeeIsActive ? " · พ้นสภาพ" : ""}
                      </p>
                      {canShare ? <p className="mt-0.5 text-xs text-muted-foreground">แชร์ {item.sharedUserCount ?? 0} บัญชี</p> : null}
                    </div>
                  </div>
                  <div className="pl-6">
                    <DocumentActions item={item} canShare={canShare} canDelete={canDelete} onShare={openShareEditor} onDelete={(target) => { setDeleteError(""); setShareTarget(null); setDeleteTarget(target); }} />
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <HrmDialog
        open={uploadOpen}
        title="อัปโหลดเอกสารพนักงาน"
        description={`เลือกพนักงานและไฟล์ที่ต้องการจัดเก็บ ขนาดไฟล์ไม่เกิน ${MAX_EMPLOYEE_DOCUMENT_MB} MB`}
        onClose={() => { if (!uploading) setUploadOpen(false); }}
        footer={(
          <>
            <Button type="button" variant="outline" disabled={uploading} onClick={() => setUploadOpen(false)}>ยกเลิก</Button>
            <Button type="submit" form="document-upload-form" disabled={uploading || employeesLoading || !employees.length}>
              {uploading ? `กำลังอัปโหลด… ${uploadProgress ?? 0}%` : "อัปโหลด"}
            </Button>
          </>
        )}
      >
        <form id="document-upload-form" className="mt-4 space-y-4" onSubmit={uploadDocument}>
          <div className="grid gap-1.5">
            <label htmlFor={uploadEmployeeSelectId} className="text-sm font-medium">พนักงาน</label>
            <Select
              id={uploadEmployeeSelectId}
              aria-label="เลือกพนักงานสำหรับเอกสาร"
              selectedKey={uploadEmployeeId || undefined}
              onSelectionChange={setUploadEmployeeId}
              placeholder="เลือกพนักงาน"
              isDisabled={employeesLoading || !employees.length}
            >
              {employees.map((employee) => (
                <SelectItem key={employee.id} id={employee.id}>
                  {employee.code} · {employee.firstName} {employee.lastName}
                </SelectItem>
              ))}
            </Select>
            {employeesLoading ? <p className="text-xs text-muted-foreground">กำลังโหลดรายชื่อพนักงาน…</p> : null}
            {employeesError ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-status-danger">
                <span>{employeesError}</span>
                <Button type="button" variant="ghost" size="xs" onClick={loadEmployees}>โหลดรายชื่ออีกครั้ง</Button>
              </div>
            ) : null}
            {!employeesLoading && !employeesError && !employees.length ? (
              <p className="text-xs text-muted-foreground">ไม่พบพนักงานที่ยังปฏิบัติงาน</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={uploadFileId} className="text-sm font-medium">ไฟล์เอกสาร</label>
            <Input
              id={uploadFileId}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={handleUploadFileChange}
              aria-describedby={`${uploadFileId}-help`}
              disabled={uploading}
            />
            <p id={`${uploadFileId}-help`} className="text-xs leading-5 text-muted-foreground">
              PDF, Word, Excel, JPG หรือ PNG · ไม่เกิน {MAX_EMPLOYEE_DOCUMENT_MB} MB
            </p>
            {uploadError ? <Feedback danger>{uploadError}</Feedback> : null}
          </div>
        </form>
      </HrmDialog>

      <HrmDialog
        open={Boolean(shareTarget)}
        title="กำหนดสิทธิ์เข้าถึงเอกสาร"
        description={shareTarget ? `${shareTarget.fileName} · ${shareTarget.employeeName}` : undefined}
        onClose={() => { if (!savingShare) setShareTarget(null); }}
        footer={(
          <>
            <Button type="button" variant="outline" disabled={savingShare} onClick={() => setShareTarget(null)}>ยกเลิก</Button>
            <Button type="button" disabled={savingShare || accountsLoading || !accountsLoaded} onClick={saveShareAccess}>
              {savingShare ? "กำลังบันทึก…" : "บันทึกสิทธิ์"}
            </Button>
          </>
        )}
      >
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-5 text-muted-foreground">
            เลือกบัญชีที่มีสิทธิ์ดูเอกสารพนักงาน ผู้จัดการเอกสารยังเข้าถึงได้ทุกไฟล์
          </p>
          {accounts.length > 5 ? (
            <Input label="ค้นหาบัญชี" value={accountQuery} onChange={setAccountQuery} placeholder="ชื่อ รหัสพนักงาน หรืออีเมล" />
          ) : null}
          {accountsLoading ? <p className="py-2 text-sm text-muted-foreground">กำลังโหลดบัญชี…</p> : null}
          {!accountsLoading && accountsLoaded && !accounts.length ? (
            <p className="border-y border-border py-3 text-sm text-muted-foreground">ยังไม่มีบัญชีที่ได้รับสิทธิ์ดูเอกสารพนักงาน</p>
          ) : null}
          {!accountsLoading && accounts.length ? (
            <fieldset className="max-h-64 space-y-1 overflow-y-auto border-y border-border py-2">
              <legend className="sr-only">บัญชีผู้ใช้ที่มีสิทธิ์ดูเอกสารพนักงาน</legend>
              {visibleAccounts.map((account) => {
                const name = `${account.firstName} ${account.lastName}`.trim();
                return (
                  <label key={account.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={selectedAccounts.has(account.id)}
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
              {!visibleAccounts.length ? <p className="px-2 py-3 text-sm text-muted-foreground">ไม่พบบัญชีที่ค้นหา</p> : null}
            </fieldset>
          ) : null}
          {shareError ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Feedback danger>{shareError}</Feedback>
              {!accountsLoaded ? <Button type="button" variant="outline" size="sm" onClick={loadAccounts}>ลองอีกครั้ง</Button> : null}
            </div>
          ) : null}
        </div>
      </HrmDialog>

      <HrmDialog
        open={Boolean(deleteTarget)}
        title="ยืนยันการลบเอกสาร"
        description={deleteTarget ? `${deleteTarget.fileName} · ${deleteTarget.employeeName}` : undefined}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        footer={(
          <>
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>ยกเลิก</Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={deleteDocument}>
              {deleting ? "กำลังลบ…" : "ลบเอกสาร"}
            </Button>
          </>
        )}
      >
        <div className="mt-3 space-y-2">
          <p className="text-sm text-foreground">ไฟล์นี้จะถูกลบออกจาก Google Drive และรายการเอกสารของพนักงาน</p>
          {deleteError ? <Feedback danger>{deleteError}</Feedback> : null}
        </div>
      </HrmDialog>
    </div>
  );
}
