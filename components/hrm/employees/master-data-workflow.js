import { useState } from "react";
import { explainFailure, readJsonSafe } from "@/components/hrm/api-response";

export function useMasterDataWorkflow() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function clearFeedback() {
    setError("");
    setNotice("");
    setDeleteError("");
  }

  async function saveMaster({ config, draft, editing, onSaved }) {
    if (!draft.name.trim()) {
      setError("กรุณากรอกชื่อรายการ");
      return false;
    }
    if (config.hasCode && !draft.code.trim()) {
      setError("กรุณากรอกรหัสประเภทการจ้าง");
      return false;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(editing ? `${config.endpoint}/${editing.id}` : config.endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config.hasCode
          ? { name: draft.name.trim(), code: draft.code.trim() }
          : { name: draft.name.trim() }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setError(explainFailure(payload.error, "บันทึกรายการไม่สำเร็จ"));
        return false;
      }

      const item = payload.item;
      onSaved?.(item);
      setNotice(`${editing ? "แก้ไข" : "เพิ่ม"}${config.label} “${item.name}” สำเร็จ`);
      return true;
    } catch {
      setError("บันทึกรายการไม่สำเร็จ เพราะเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteMaster({ config, item, onDeleted }) {
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`${config.endpoint}/${item.id}`, { method: "DELETE" });
      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setDeleteError(explainFailure(payload.error, `ลบ${config.label}ไม่สำเร็จ`));
        return false;
      }

      onDeleted?.();
      setNotice(`ลบ${config.label} “${item.name}” สำเร็จ และล้างข้อมูลที่พนักงานอ้างอิงแล้ว`);
      return true;
    } catch {
      setDeleteError(`ลบ${config.label}ไม่สำเร็จ เพราะเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่`);
      return false;
    } finally {
      setDeleting(false);
    }
  }

  return { saving, error, notice, deleting, deleteError, clearFeedback, saveMaster, deleteMaster };
}
