"use client";

import { useEffect, useState } from "react";
import { RiAddLine } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { cx } from "@/utils/cx";

// Generic CRUD tab for settings/master-data resources. Leave types keep their
// deactivate/reactivate lifecycle; employee lookup tables are hard-deleted
// and their employee references are cleared by the database.

function emptyFormValues(formFields) {
  return formFields.reduce((acc, field) => {
    acc[field.key] = "";
    return acc;
  }, {});
}

function formValuesFromItem(formFields, item) {
  return formFields.reduce((acc, field) => {
    const value = item?.[field.key];
    acc[field.key] = value === null || value === undefined ? "" : String(value);
    return acc;
  }, {});
}

function buildPayload(formFields, values, { isEdit }) {
  const payload = {};
  for (const field of formFields) {
    if (isEdit && field.readOnlyOnEdit) continue;
    const raw = values[field.key];
    if (field.type === "number") {
      payload[field.key] = raw === "" || raw === undefined ? null : Number(raw);
    } else if (field.type === "textarea") {
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      payload[field.key] = trimmed === "" ? null : trimmed;
    } else {
      payload[field.key] = typeof raw === "string" ? raw.trim() : raw;
    }
  }
  return payload;
}

export function ResourceTab({
  resourceKey,
  title,
  description,
  addLabel = "เพิ่ม",
  endpoint,
  idKey = "id",
  primaryField = "name",
  detailFields = [],
  formFields,
  emptyLabel = "ยังไม่มีข้อมูล",
  deleteMode = "deactivate",
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formValues, setFormValues] = useState(() => emptyFormValues(formFields));
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [togglingId, setTogglingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    fetch(endpoint)
      .then((response) => {
        if (!response.ok) throw new Error("failed to load");
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setItems(payload.items || []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("ไม่สามารถโหลดข้อมูลได้");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, refreshToken]);

  const sortedItems = [...items].sort((a, b) => Number(b.isActive) - Number(a.isActive));

  function openAdd() {
    setEditing(null);
    setFormValues(emptyFormValues(formFields));
    setFormError("");
    setDialogOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setFormValues(formValuesFromItem(formFields, item));
    setFormError("");
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
  }

  function updateField(key, value) {
    setFormValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const isEdit = Boolean(editing);

    for (const field of formFields) {
      if (isEdit && field.readOnlyOnEdit) continue;
      const raw = formValues[field.key];
      if (field.required && !String(raw || "").trim()) {
        setFormError(`กรุณากรอก${field.label}`);
        return;
      }
      if (field.type === "number" && raw !== "" && (!Number.isInteger(Number(raw)) || Number(raw) < 0)) {
        setFormError(`${field.label}ต้องเป็นจำนวนเต็มไม่ติดลบ`);
        return;
      }
    }

    setSubmitting(true);
    setFormError("");
    try {
      const payload = buildPayload(formFields, formValues, { isEdit });
      const url = isEdit ? `${endpoint}/${encodeURIComponent(editing[idKey])}` : endpoint;
      const response = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        setFormError(errorPayload.error || "บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่");
        return;
      }

      const resultPayload = await response.json();
      setItems((current) => {
        if (isEdit) {
          return current.map((item) => (item[idKey] === resultPayload.item[idKey] ? resultPayload.item : item));
        }
        return [...current, resultPayload.item];
      });
      setNotice(isEdit ? "บันทึกการแก้ไขแล้ว" : "เพิ่มรายการใหม่แล้ว");
      closeDialog();
    } catch {
      setFormError("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(item) {
    setTogglingId(item[idKey]);
    try {
      const url = `${endpoint}/${encodeURIComponent(item[idKey])}`;
      const response = await fetch(url, {
        method: item.isActive ? "DELETE" : "PATCH",
        headers: item.isActive ? undefined : { "Content-Type": "application/json" },
        body: item.isActive ? undefined : JSON.stringify({ isActive: true }),
      });
      if (!response.ok) {
        setNotice("ไม่สามารถเปลี่ยนสถานะได้ กรุณาลองใหม่");
        return;
      }
      const payload = await response.json();
      setItems((current) => current.map((entry) => (entry[idKey] === item[idKey] ? payload.item : entry)));
      setNotice(item.isActive ? "ปิดใช้งานรายการแล้ว" : "เปิดใช้งานรายการแล้ว");
    } catch {
      setNotice("ไม่สามารถเชื่อมต่อกับระบบได้ กรุณาลองใหม่");
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteItem() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(deleteTarget[idKey])}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDeleteError(payload.error ? `ลบไม่สำเร็จ: ${payload.error}` : "ลบไม่สำเร็จ เพราะระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่");
        return;
      }
      setItems((current) => current.filter((item) => item[idKey] !== deleteTarget[idKey]));
      setNotice(`ลบ${title} “${deleteTarget[primaryField]}” สำเร็จ และล้างค่าที่พนักงานอ้างอิงแล้ว`);
      setDeleteTarget(null);
    } catch {
      setDeleteError("ลบไม่สำเร็จ เพราะเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4" data-resource={resourceKey}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold leading-6 text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
        </div>
        <Button size="small" leadingIcon={RiAddLine} onClick={openAdd}>
          {addLabel}
        </Button>
      </div>
      {notice ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs font-medium leading-5 text-primary">
          <span>{notice}</span>
          <Button size="xs" variant="ghost" onClick={() => setNotice("")}>
            ปิด
          </Button>
        </div>
      ) : null}
      {loadError ? <p className="text-xs leading-5 text-status-danger">{loadError}</p> : null}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <p className="p-10 text-center text-xs leading-5 text-muted-foreground">กำลังโหลดข้อมูล...</p>
        ) : sortedItems.length === 0 ? (
          <p className="p-10 text-center text-xs leading-5 text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="divide-y divide-border">
            {sortedItems.map((item) => (
              <li
                key={item[idKey]}
                className={cx(
                  "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between",
                  !item.isActive && "opacity-60",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-medium leading-5 text-foreground">{item[primaryField]}</strong>
                    {!item.isActive ? (
                      <Badge variant="caption" color="gray">
                        ปิดใช้งาน
                      </Badge>
                    ) : null}
                  </div>
                  {detailFields.length > 0 ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {detailFields.map((field) => field.render(item)).filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2">
                  <Button size="small" variant="secondary" onClick={() => openEdit(item)}>
                    แก้ไข
                  </Button>
                  {deleteMode === "hard" ? (
                    <Button size="small" variant="danger" disabled={deleting} onClick={() => { setDeleteTarget(item); setDeleteError(""); }}>
                      ลบ
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="outline"
                      disabled={togglingId === item[idKey]}
                      onClick={() => toggleActive(item)}
                    >
                      {item.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <HrmDialog
        open={dialogOpen}
        onClose={closeDialog}
        title={editing ? `แก้ไข${title}` : `เพิ่ม${title}`}
        description={editing ? "แก้ไขข้อมูลแล้วกดบันทึก" : "กรอกข้อมูลให้ครบถ้วนแล้วกดบันทึก"}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeDialog}>
              ยกเลิก
            </Button>
            <Button type="submit" form={`${resourceKey}-form`} disabled={submitting}>
              บันทึก
            </Button>
          </>
        }
      >
        <form id={`${resourceKey}-form`} className="space-y-4" onSubmit={submit}>
          {formFields.map((field) => {
            const isReadOnly = Boolean(editing && field.readOnlyOnEdit);
            if (field.type === "textarea") {
              return (
                <Textarea
                  key={field.key}
                  label={field.label}
                  value={formValues[field.key] || ""}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  rows={3}
                />
              );
            }
            return (
              <div key={field.key} className="grid gap-1.5">
                <Input
                  label={`${field.label}${field.required ? " *" : ""}`}
                  type={field.type === "number" ? "number" : "text"}
                  value={formValues[field.key] || ""}
                  onChange={(value) => updateField(field.key, value)}
                  isRequired={field.required && !isReadOnly}
                  isReadOnly={isReadOnly}
                />
                {field.hint ? <p className="text-xs leading-5 text-muted-foreground">{field.hint}</p> : null}
              </div>
            );
          })}
          {formError ? <p className="text-xs leading-5 text-status-danger">{formError}</p> : null}
        </form>
      </HrmDialog>
      {deleteMode === "hard" ? (
        <HrmDialog
          open={Boolean(deleteTarget)}
          onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(""); } }}
          title={`ยืนยันการลบ${title}`}
          description="พนักงานเดิมจะยังอยู่ แต่ช่องที่อ้างอิงรายการนี้จะถูกล้างเป็นค่าว่าง"
          size="sm"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>ยกเลิก</Button>
              <Button type="button" variant="danger" onClick={deleteItem} disabled={deleting}>{deleting ? "กำลังลบ..." : "ยืนยันลบ"}</Button>
            </>
          }
        >
          <p className="text-sm text-foreground">ต้องการลบ <strong>{deleteTarget?.[primaryField]}</strong> ใช่หรือไม่</p>
          {deleteError ? <p role="alert" className="mt-3 rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-sm text-status-danger">{deleteError}</p> : null}
        </HrmDialog>
      ) : null}
    </div>
  );
}

export default ResourceTab;
