import { useState } from "react";

export async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function explainFailure(raw, fallback) {
  if (!raw || typeof raw !== "string") return fallback;
  if (/รหัสพนักงาน .*ซ้ำกับ|รหัสพนักงาน .*ถูกใช้แล้ว/.test(raw)) return raw;
  if (/email is required for an employee with a login account/i.test(raw)) return "พนักงานที่มีบัญชีเข้าสู่ระบบต้องมีอีเมล";
  if (/^email is required/i.test(raw)) return "กรุณากรอกอีเมลเพื่อใช้เป็นชื่อเข้าสู่ระบบของพนักงาน";
  if (/invalid email/i.test(raw)) return "รูปแบบอีเมลไม่ถูกต้อง";
  if (/endDate cannot be before startDate/i.test(raw)) return "วันที่สิ้นสุดการทำงานต้องไม่อยู่ก่อนวันที่เริ่มงาน";
  if (/endDate must be a YYYY-MM-DD date/i.test(raw)) return "รูปแบบวันที่สิ้นสุดการทำงานไม่ถูกต้อง";
  if (/former employees must have an end date/i.test(raw)) return "กรุณาระบุวันที่สิ้นสุดการทำงานของพนักงานพ้นสภาพ";
  if (/already exists|already in use|unique field/i.test(raw)) return "มีข้อมูลชื่อนี้หรือรหัสนี้อยู่แล้ว กรุณาตรวจสอบก่อนบันทึก";
  if (/ยังมีข้อมูลอ้างอิง|still referenced|still in use/i.test(raw)) return raw;
  if (/foreign key|referenced ids|does not exist/i.test(raw)) return "รายการที่เลือกไม่มีอยู่ในระบบ กรุณาโหลดรายการใหม่แล้วลองอีกครั้ง";
  if (/not found/i.test(raw)) return "ไม่พบข้อมูลที่ต้องการ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง";
  if (/invalid|is required|must be|no fields to update/i.test(raw)) return "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง กรุณาตรวจสอบข้อมูลในแบบฟอร์ม";
  if (/forbidden|unauthorized/i.test(raw)) return "บัญชีนี้ไม่มีสิทธิ์ทำรายการดังกล่าว";
  if (/off-boarded/i.test(raw)) return "พนักงานพ้นสภาพแล้ว จึงทำรายการนี้ซ้ำไม่ได้";
  return `ระบบแจ้งว่า: ${raw}`;
}

export function formatThaiDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function validateEmployeeForm(form, employee) {
  if (!form.firstName.trim() || !form.lastName.trim()) return "กรุณากรอกชื่อและนามสกุล";
  if (!/^\d{4}$/.test(form.code.trim())) return "กรุณากำหนดรหัสพนักงานเป็นตัวเลข 4 หลัก เช่น 2603";
  if (!employee && !form.email.trim()) return "กรุณากรอกอีเมลเพื่อใช้เป็นชื่อเข้าสู่ระบบของพนักงาน";
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "รูปแบบอีเมลไม่ถูกต้อง";
  if (!form.startDate) return "กรุณากรอกวันที่เริ่มงาน";
  if (employee && !employee.isActive && !form.endDate) return "กรุณาระบุวันที่สิ้นสุดการทำงาน";
  return null;
}

function employeeRequestBody(form, employee, lookups) {
  const operationalStatus = lookups.employmentStatuses.find((item) => item.name === "ปฏิบัติงาน" && item.isActive !== false)
    || lookups.employmentStatuses.find((item) => item.name !== "พ้นสภาพ" && item.isActive !== false);

  return {
    code: form.code.trim(),
    prefix: form.prefix || null,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    nickname: form.nickname || null,
    firstNameEn: form.firstNameEn || null,
    lastNameEn: form.lastNameEn || null,
    citizenId: form.citizenId || null,
    birthDate: form.birthDate || null,
    email: form.email || null,
    phone: form.phone || null,
    avatarUrl: form.avatarUrl || null,
    startDate: form.startDate,
    ...(employee ? { endDate: form.endDate || null } : {}),
    departmentId: form.departmentId ? Number(form.departmentId) : null,
    positionId: form.positionId ? Number(form.positionId) : null,
    employmentTypeId: form.employmentTypeId ? Number(form.employmentTypeId) : null,
    ...(!employee ? { employmentStatusId: operationalStatus?.id ?? null } : {}),
  };
}

function networkFailure(action) {
  return `${action}ไม่สำเร็จ เพราะเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่`;
}

async function requestEmployeeMutation({ url, method, body, fallback, networkAction }) {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await readJsonSafe(response);
    if (!response.ok) return { ok: false, message: explainFailure(payload.error, fallback) };
    return { ok: true, item: payload.item };
  } catch {
    return { ok: false, message: networkFailure(networkAction) };
  }
}

export function useEmployeeWorkflow({ onEmployeesChanged, onEmployeeChanged, onSuccess }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [offboarding, setOffboarding] = useState(false);
  const [offboardError, setOffboardError] = useState("");

  async function saveEmployee({ employee, form, lookups }) {
    const validationError = validateEmployeeForm(form, employee);
    if (validationError) {
      setFormError(validationError);
      return false;
    }

    setSaving(true);
    setFormError("");
    try {
      const outcome = await requestEmployeeMutation({
        url: employee ? `/api/employees/${employee.id}` : "/api/employees",
        method: employee ? "PATCH" : "POST",
        body: employeeRequestBody(form, employee, lookups),
        fallback: "บันทึกข้อมูลพนักงานไม่สำเร็จ",
        networkAction: "บันทึกข้อมูลพนักงาน",
      });
      if (!outcome.ok) {
        setFormError(outcome.message);
        return false;
      }

      const item = outcome.item;
      if (!item) {
        setFormError("บันทึกข้อมูลพนักงานไม่สำเร็จ");
        return false;
      }
      const name = `${item.firstName} ${item.lastName}`;
      const message = employee
        ? `บันทึกข้อมูล ${name} สำเร็จ`
        : `เพิ่มพนักงาน ${name} สำเร็จ รหัส ${item.code} · รหัสผ่านเริ่มต้นคือ ${item.code} และต้องเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก`;
      if (employee) onEmployeeChanged?.(employee.id, item);
      onSuccess?.(message);
      onEmployeesChanged?.();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function offboardEmployee({ employee, endDate }) {
    if (!employee) return false;
    if (!endDate) {
      setOffboardError("กรุณาระบุวันที่สิ้นสุดการทำงาน");
      return false;
    }

    setOffboarding(true);
    setOffboardError("");
    try {
      const outcome = await requestEmployeeMutation({
        url: `/api/employees/${employee.id}`,
        method: "DELETE",
        body: { endDate },
        fallback: "เปลี่ยนสถานะพนักงานเป็นพ้นสภาพไม่สำเร็จ",
        networkAction: "เปลี่ยนสถานะพนักงานเป็นพ้นสภาพ",
      });
      if (!outcome.ok) {
        setOffboardError(outcome.message);
        return false;
      }

      const item = outcome.item || null;
      const message = `เปลี่ยนสถานะ ${employee.firstName} ${employee.lastName} เป็นพ้นสภาพสำเร็จ วันที่สิ้นสุดงาน ${formatThaiDate(item?.endDate || endDate)}`;
      onEmployeeChanged?.(employee.id, item);
      onSuccess?.(message);
      onEmployeesChanged?.();
      return true;
    } finally {
      setOffboarding(false);
    }
  }

  return {
    saving,
    formError,
    setFormError,
    offboarding,
    offboardError,
    setOffboardError,
    saveEmployee,
    offboardEmployee,
  };
}
