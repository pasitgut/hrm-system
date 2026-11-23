"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RiAddLine,
  RiAlertLine,
  RiDeleteBinLine,
  RiEditLine,
  RiRefreshLine,
  RiSearchLine,
} from "@remixicon/react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { PageHeader } from "@/components/hrm/PageHeader";
import { ADMIN_TABLE_GROUPS } from "@/lib/admin-data/registry";

const NONE_SENTINEL = "__none__";
const PAGE_SIZE = 50;

function resolveFieldOptions(field, lookups) {
  if (Array.isArray(field.options)) return field.options;
  if (field.lookup && Array.isArray(lookups?.[field.lookup])) return lookups[field.lookup];
  return [];
}

function formatCellValue(field, row, lookups) {
  if (field.displayKey && row[field.displayKey] !== undefined && row[field.displayKey] !== null && row[field.displayKey] !== "") {
    return String(row[field.displayKey]);
  }
  const value = row[field.key];
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (field.type === "boolean") {
    return value ? "เปิดใช้งาน" : "ปิดใช้งาน";
  }
  if (field.type === "select") {
    const match = resolveFieldOptions(field, lookups).find((opt) => String(opt.value) === String(value));
    if (match) return match.label;
  }
  return String(value);
}

function buildInitialForm(meta, lookups, mode, row = null) {
  const initial = {};
  for (const field of meta.fields) {
    if (mode === "create" && !field.creatable) continue;
    if (mode === "edit" && !field.editable && field.type !== "readonly") continue;
    if (mode === "edit" && row) {
      if (field.type === "password") {
        initial[field.key] = "";
      } else if (field.type === "boolean") {
        initial[field.key] = Boolean(row[field.key]);
      } else if (field.type === "select") {
        const raw = row[field.key];
        initial[field.key] = raw != null && raw !== "" ? String(raw) : (field.nullable ? NONE_SENTINEL : "");
      } else {
        initial[field.key] = row[field.key] == null ? "" : String(row[field.key]);
      }
    } else {
      if (field.type === "boolean") {
        initial[field.key] = field.key !== "isOt";
      } else if (field.type === "select") {
        const opts = resolveFieldOptions(field, lookups);
        if (field.nullable) {
          initial[field.key] = NONE_SENTINEL;
        } else {
          initial[field.key] = opts[0]?.value != null ? String(opts[0].value) : "";
        }
      } else {
        initial[field.key] = "";
      }
    }
  }
  return initial;
}

export default function AdminDataModule() {
  const [tables, setTables] = useState([]);
  const [lookups, setLookups] = useState({});
  const [activeTableKey, setActiveTableKey] = useState("employees");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [formDialog, setFormDialog] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);

  const loadResources = useCallback(async () => {
    const response = await fetch("/api/admin-data");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "โหลดรายการตารางข้อมูลไม่สำเร็จ");
    setTables(payload.tables || []);
    setLookups(payload.lookups || {});
    return payload;
  }, []);

  const loadRows = useCallback(async (tableKey = activeTableKey, nextPage = page, nextSearch = search) => {
    setLoadingRows(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
      });
      if (nextSearch.trim()) params.set("search", nextSearch.trim());
      const response = await fetch(`/api/admin-data/${encodeURIComponent(tableKey)}?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลในตารางไม่สำเร็จ");
      setRows(payload.rows || []);
      setTotal(Number(payload.total ?? 0));
    } catch (loadErr) {
      setError(loadErr.message || "โหลดข้อมูลในตารางไม่สำเร็จ");
    } finally {
      setLoadingRows(false);
    }
  }, [activeTableKey, page, search]);

  useEffect(() => {
    let cancelled = false;
    setLoadingResources(true);
    loadResources()
      .then((payload) => {
        if (cancelled) return;
        const firstKey = payload.tables?.[0]?.key || "employees";
        setActiveTableKey(firstKey);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "โหลดรายการตารางข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoadingResources(false);
      });
    return () => { cancelled = true; };
  }, [loadResources]);

  useEffect(() => {
    if (!loadingResources) {
      loadRows(activeTableKey, page, search);
    }
  }, [loadingResources, activeTableKey, page, search, loadRows]);

  const activeMeta = useMemo(
    () => tables.find((t) => t.key === activeTableKey) ?? null,
    [tables, activeTableKey],
  );

  const tableColumns = useMemo(
    () => (activeMeta ? activeMeta.fields.filter((f) => f.showInTable) : []),
    [activeMeta],
  );

  function selectTable(nextKey) {
    setActiveTableKey(nextKey);
    setSearch("");
    setPage(1);
    setError("");
    setNotice("");
  }

  function openCreateDialog() {
    if (!activeMeta) return;
    setFormDialog({
      mode: "create",
      rowId: null,
      values: buildInitialForm(activeMeta, lookups, "create"),
      saving: false,
      error: "",
    });
  }

  function openEditDialog(row) {
    if (!activeMeta) return;
    const pk = row[activeMeta.primaryKey];
    setFormDialog({
      mode: "edit",
      rowId: String(pk),
      values: buildInitialForm(activeMeta, lookups, "edit", row),
      saving: false,
      error: "",
    });
  }

  async function submitFormDialog(event) {
    event.preventDefault();
    if (!activeMeta || !formDialog || formDialog.saving) return;
    setFormDialog((cur) => cur ? { ...cur, saving: true, error: "" } : null);

    try {
      const body = {};
      for (const field of activeMeta.fields) {
        if (formDialog.mode === "create" && !field.creatable) continue;
        if (formDialog.mode === "edit" && !field.editable) continue;
        let val = formDialog.values[field.key];
        if (field.type === "select" && val === NONE_SENTINEL) {
          val = null;
        }
        body[field.key] = val;
      }

      const url = formDialog.mode === "create"
        ? `/api/admin-data/${encodeURIComponent(activeMeta.key)}`
        : `/api/admin-data/${encodeURIComponent(activeMeta.key)}/${encodeURIComponent(formDialog.rowId)}`;
      const response = await fetch(url, {
        method: formDialog.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "บันทึกข้อมูลไม่สำเร็จ");
      }
      const modeLabel = formDialog.mode === "create" ? "เพิ่ม" : "แก้ไข";
      setFormDialog(null);
      setNotice(`${modeLabel}ข้อมูลในตาราง “${activeMeta.label}” เรียบร้อยแล้ว`);
      await Promise.all([loadResources(), loadRows(activeMeta.key, page, search)]);
    } catch (submitErr) {
      setFormDialog((cur) => cur ? { ...cur, saving: false, error: submitErr.message || "บันทึกข้อมูลไม่สำเร็จ" } : null);
    }
  }

  async function openDeleteDialog(row) {
    if (!activeMeta) return;
    const pk = String(row[activeMeta.primaryKey]);
    setDeleteDialog({
      rowId: pk,
      loadingImpact: true,
      impact: null,
      confirmInput: "",
      deleting: false,
      error: "",
    });
    try {
      const response = await fetch(`/api/admin-data/${encodeURIComponent(activeMeta.key)}/${encodeURIComponent(pk)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "ตรวจสอบผลกระทบก่อนลบไม่สำเร็จ");
      setDeleteDialog((cur) => cur && cur.rowId === pk ? { ...cur, loadingImpact: false, impact: payload } : cur);
    } catch (err) {
      setDeleteDialog((cur) => cur && cur.rowId === pk ? { ...cur, loadingImpact: false, error: err.message || "ตรวจสอบผลกระทบไม่สำเร็จ" } : cur);
    }
  }

  async function confirmHardDelete() {
    if (!activeMeta || !deleteDialog || deleteDialog.deleting) return;
    setDeleteDialog((cur) => cur ? { ...cur, deleting: true, error: "" } : null);
    try {
      const response = await fetch(
        `/api/admin-data/${encodeURIComponent(activeMeta.key)}/${encodeURIComponent(deleteDialog.rowId)}`,
        { method: "DELETE" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "ลบข้อมูลถาวรไม่สำเร็จ");
      setDeleteDialog(null);
      setNotice(`ลบข้อมูลออกจากตาราง “${activeMeta.label}” ถาวรเรียบร้อยแล้ว`);
      const nextPage = rows.length <= 1 && page > 1 ? page - 1 : page;
      if (nextPage !== page) setPage(nextPage);
      await Promise.all([loadResources(), loadRows(activeMeta.key, nextPage, search)]);
    } catch (err) {
      setDeleteDialog((cur) => cur ? { ...cur, deleting: false, error: err.message || "ลบข้อมูลถาวรไม่สำเร็จ" } : null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const deleteConfirmReady = Boolean(
    deleteDialog
    && !deleteDialog.loadingImpact
    && deleteDialog.impact
    && (!deleteDialog.impact.confirmText || deleteDialog.confirmInput.trim() === deleteDialog.impact.confirmText),
  );

  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow="ระบบ · ผู้ดูแลระบบ"
        title="จัดการฐานข้อมูล (Admin CRUD)"
        description="ดู เพิ่ม แก้ไข รีเซ็ตรหัสผ่าน กู้คืนสถานะ และลบข้อมูลถาวรออกจากฐานข้อมูลได้โดยไม่ต้องเขียน SQL"
        actions={
          <Button
            type="button"
            variant="outline"
            leadingIcon={RiRefreshLine}
            onClick={() => {
              loadResources();
              loadRows(activeTableKey, page, search);
            }}
          >
            รีเฟรชข้อมูล
          </Button>
        }
      />

      <div className="flex items-start gap-2.5 rounded-lg border border-status-warning/30 bg-status-warning/10 px-4 py-3 text-xs leading-5 text-foreground">
        <RiAlertLine className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
        <p>
          <strong>พื้นที่สำหรับผู้ดูแลระบบ:</strong> การแก้ไขหรือปุ่ม <strong>“ลบถาวร”</strong> ในหน้านี้จะลบข้อมูลออกจาก PostgreSQL จริงทันที (เช่น การลบพนักงานจะลบบัญชีผู้ใช้ คำขอ OT วันลา และทรัพย์สินที่ผูกอยู่ด้วย) ต่างจากหน้าพนักงานปกติที่เป็นการเปลี่ยนสถานะพ้นสภาพ
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(15rem,17.5rem)_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <div className="lg:hidden">
            <label htmlFor="admin-table-select-mobile" className="mb-1.5 block text-xs font-semibold text-foreground">
              เลือกตารางข้อมูล
            </label>
            <Select
              id="admin-table-select-mobile"
              aria-label="เลือกตารางข้อมูล"
              selectedKey={activeTableKey}
              onSelectionChange={(value) => selectTable(String(value))}
            >
              {tables.map((t) => (
                <SelectItem key={t.key} id={t.key}>
                  {t.label} ({t.rowCount})
                </SelectItem>
              ))}
            </Select>
          </div>

          <nav aria-label="ตารางข้อมูลในระบบ" className="hidden space-y-4 lg:block">
            {ADMIN_TABLE_GROUPS.map((group) => {
              const groupTables = tables.filter((t) => t.group === group);
              if (groupTables.length === 0) return null;
              return (
                <section key={group} className="space-y-1">
                  <h2 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </h2>
                  <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                    {groupTables.map((t) => {
                      const selected = t.key === activeTableKey;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => selectTable(t.key)}
                          aria-pressed={selected}
                          className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            selected ? "bg-primary/5 font-medium text-primary" : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <span className="min-w-0 truncate">{t.label}</span>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                            {t.rowCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
          {activeMeta ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">{activeMeta.label}</h2>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {activeMeta.key}
                    </code>
                    <Badge color="neutral" variant="caption">{total} รายการ</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{activeMeta.description}</p>
                </div>
                {activeMeta.creatable ? (
                  <Button type="button" leadingIcon={RiAddLine} onClick={openCreateDialog}>
                    เพิ่มรายการ
                  </Button>
                ) : null}
              </div>

              <div className="w-full sm:max-w-sm">
                <label htmlFor="admin-data-search" className="sr-only">ค้นหาในตาราง</label>
                <Input
                  id="admin-data-search"
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    setPage(1);
                  }}
                  placeholder={`ค้นหาใน${activeMeta.label}…`}
                  leadingIcon={RiSearchLine}
                />
              </div>
            </div>
          ) : null}

          <div aria-live="polite">
            {error ? <p role="alert" className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">{error}</p> : null}
            {notice ? <p role="status" className="rounded-md border border-status-success/30 bg-status-success/10 px-3 py-2 text-xs text-status-success">{notice}</p> : null}
          </div>

          <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={activeMeta?.label || "ข้อมูลตาราง"}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead className="border-b border-border bg-muted">
                  <tr>
                    {tableColumns.map((col) => (
                      <th key={col.key} scope="col" className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted-foreground">
                        {col.label}
                      </th>
                    ))}
                    <th scope="col" className="w-40 whitespace-nowrap px-3 py-3 text-right text-xs font-semibold text-muted-foreground">
                      การจัดการ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRows ? (
                    <tr>
                      <td colSpan={tableColumns.length + 1} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        กำลังโหลดข้อมูล…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={tableColumns.length + 1} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        ไม่พบข้อมูลในตารางนี้
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const pk = activeMeta ? String(row[activeMeta.primaryKey]) : "";
                      return (
                        <tr key={pk} className="border-b border-border last:border-b-0 hover:bg-muted/25">
                          {tableColumns.map((col) => {
                            const formatted = formatCellValue(col, row, lookups);
                            const isBooleanOrStatus = col.type === "boolean" || col.key === "status" || col.key === "statusCode" || col.key === "latestStatus";
                            return (
                              <td key={col.key} className="max-w-64 truncate px-3 py-2.5 text-xs text-foreground">
                                {isBooleanOrStatus && formatted !== "—" ? (
                                  <StatusBadge status={col.type === "boolean" ? (row[col.key] ? "active" : "inactive") : String(row[col.key])}>
                                    {formatted}
                                  </StatusBadge>
                                ) : (
                                  <span title={formatted}>{formatted}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              {activeMeta?.editable ? (
                                <Button type="button" size="xs" variant="ghost" leadingIcon={RiEditLine} onClick={() => openEditDialog(row)}>
                                  แก้ไข
                                </Button>
                              ) : null}
                              {activeMeta?.deletable ? (
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  className="text-status-danger hover:text-status-danger"
                                  leadingIcon={RiDeleteBinLine}
                                  onClick={() => openDeleteDialog(row)}
                                >
                                  ลบถาวร
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {total > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  หน้า {page} / {totalPages} · ทั้งหมด {total} รายการ
                </span>
                <div className="flex items-center gap-2">
                  <Button type="button" size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    ก่อนหน้า
                  </Button>
                  <Button type="button" size="xs" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    ถัดไป
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <HrmDialog
        open={Boolean(formDialog)}
        onClose={() => setFormDialog(null)}
        size="lg"
        title={formDialog?.mode === "create" ? `เพิ่มข้อมูล · ${activeMeta?.label ?? ""}` : `แก้ไขข้อมูล · ${activeMeta?.label ?? ""}`}
        description={activeMeta?.description}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setFormDialog(null)} disabled={formDialog?.saving}>
              ยกเลิก
            </Button>
            <Button type="submit" form="admin-data-record-form" disabled={formDialog?.saving}>
              {formDialog?.saving ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
            </Button>
          </>
        }
      >
        {formDialog && activeMeta ? (
          <form id="admin-data-record-form" onSubmit={submitFormDialog} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {activeMeta.fields.map((field) => {
                const isCreate = formDialog.mode === "create";
                if (isCreate && !field.creatable) return null;
                const editable = isCreate ? field.creatable : field.editable;
                if (!isCreate && !editable && field.type !== "readonly") {
                  // Show non-editable identifier as read-only context during edit
                  const displayVal = rowValueDisplay(field, formDialog.values[field.key], lookups);
                  return (
                    <Input
                      key={field.key}
                      label={field.label}
                      value={displayVal}
                      isReadOnly
                      isDisabled
                    />
                  );
                }

                const fieldValue = formDialog.values[field.key] ?? "";
                if (field.type === "readonly") {
                  return (
                    <Input
                      key={field.key}
                      label={field.label}
                      value={String(fieldValue)}
                      isReadOnly
                      isDisabled
                    />
                  );
                }

                if (field.type === "boolean") {
                  return (
                    <div key={field.key} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 sm:col-span-2">
                      <div>
                        <span className="block text-sm font-medium text-foreground">{field.label}</span>
                        {field.hint ? <span className="block text-xs text-muted-foreground">{field.hint}</span> : null}
                      </div>
                      <Switch
                        isSelected={Boolean(fieldValue)}
                        onChange={(next) => setFormDialog((cur) => cur ? {
                          ...cur,
                          values: { ...cur.values, [field.key]: next },
                        } : null)}
                        aria-label={field.label}
                      />
                    </div>
                  );
                }

                if (field.type === "textarea") {
                  return (
                    <Textarea
                      key={field.key}
                      className="sm:col-span-2"
                      label={field.label}
                      hint={field.hint}
                      isRequired={Boolean(field.required)}
                      value={String(fieldValue)}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setFormDialog((cur) => cur ? {
                          ...cur,
                          values: { ...cur.values, [field.key]: nextVal },
                        } : null);
                      }}
                    />
                  );
                }

                if (field.type === "select") {
                  const options = resolveFieldOptions(field, lookups);
                  const selectId = `admin-field-${field.key}`;
                  return (
                    <div key={field.key} className="grid gap-1.5">
                      <label htmlFor={selectId} className="text-sm font-medium leading-none">{field.label}</label>
                      <Select
                        id={selectId}
                        aria-label={field.label}
                        selectedKey={String(fieldValue)}
                        onSelectionChange={(nextVal) => setFormDialog((cur) => cur ? {
                          ...cur,
                          values: { ...cur.values, [field.key]: String(nextVal) },
                        } : null)}
                      >
                        {field.nullable ? <SelectItem id={NONE_SENTINEL}>ไม่ระบุ</SelectItem> : null}
                        {options.map((opt) => (
                          <SelectItem key={String(opt.value)} id={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                  );
                }

                const inputType = field.type === "datetime" ? "datetime-local" : field.type;
                return (
                  <div key={field.key} className="grid gap-1">
                    <Input
                      type={inputType}
                      label={field.label}
                      placeholder={field.placeholder}
                      isRequired={Boolean(field.required && !(formDialog.mode === "edit" && field.type === "password"))}
                      value={String(fieldValue)}
                      onChange={(nextVal) => setFormDialog((cur) => cur ? {
                        ...cur,
                        values: { ...cur.values, [field.key]: nextVal },
                      } : null)}
                    />
                    {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
                  </div>
                );
              })}
            </div>
            {formDialog.error ? <p role="alert" className="text-xs font-medium text-status-danger">{formDialog.error}</p> : null}
          </form>
        ) : null}
      </HrmDialog>

      <HrmDialog
        open={Boolean(deleteDialog)}
        onClose={() => setDeleteDialog(null)}
        size="md"
        title={`ยืนยันการลบข้อมูลถาวร · ${activeMeta?.label ?? ""}`}
        description="ข้อมูลที่ลบแล้วจะไม่สามารถกู้คืนได้ กรุณาตรวจสอบรายการที่ได้รับผลกระทบก่อนยืนยัน"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleteDialog(null)} disabled={deleteDialog?.deleting}>
              ยกเลิก
            </Button>
            <Button type="button" variant="danger" onClick={confirmHardDelete} disabled={!deleteConfirmReady || deleteDialog?.deleting}>
              {deleteDialog?.deleting ? "กำลังลบ…" : "ยืนยันลบถาวร"}
            </Button>
          </>
        }
      >
        {deleteDialog ? (
          <div className="space-y-3">
            {deleteDialog.loadingImpact ? (
              <p className="text-sm text-muted-foreground">กำลังตรวจสอบข้อมูลที่เกี่ยวข้อง…</p>
            ) : deleteDialog.impact ? (
              <>
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">รายการที่จะลบ: </span>
                  <strong className="text-foreground">{deleteDialog.impact.label}</strong>
                </div>

                {activeMeta?.cascadeWarning ? (
                  <p className="text-xs leading-5 text-status-danger">{activeMeta.cascadeWarning}</p>
                ) : null}

                {deleteDialog.impact.impacts.length > 0 ? (
                  <div className="space-y-1.5 rounded-md border border-border p-3">
                    <p className="text-xs font-semibold text-foreground">ข้อมูลที่เกี่ยวข้องที่จะถูกดำเนินการพร้อมกัน:</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {deleteDialog.impact.impacts.map((item) => (
                        <li key={item.label} className="flex items-center justify-between gap-2">
                          <span>{item.label}</span>
                          <Badge color={item.action === "delete" ? "danger" : "warning"} variant="caption">
                            {item.action === "delete" ? `ลบ ${item.count} รายการ` : `อัปเดต ${item.count} รายการ`}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">ไม่พบข้อมูลลูกที่ผูกอยู่โดยตรง</p>
                )}

                {deleteDialog.impact.confirmText ? (
                  <Input
                    label={`พิมพ์รหัส "${deleteDialog.impact.confirmText}" เพื่อยืนยันการลบถาวร`}
                    placeholder={deleteDialog.impact.confirmText}
                    value={deleteDialog.confirmInput}
                    onChange={(nextVal) => setDeleteDialog((cur) => cur ? { ...cur, confirmInput: nextVal } : null)}
                  />
                ) : null}
              </>
            ) : null}

            {deleteDialog.error ? <p role="alert" className="text-xs font-medium text-status-danger">{deleteDialog.error}</p> : null}
          </div>
        ) : null}
      </HrmDialog>
    </div>
  );
}

function rowValueDisplay(field, value, lookups) {
  if (value == null || value === "" || value === NONE_SENTINEL) return "—";
  if (field.type === "select") {
    const match = resolveFieldOptions(field, lookups).find((opt) => String(opt.value) === String(value));
    if (match) return match.label;
  }
  return String(value);
}
