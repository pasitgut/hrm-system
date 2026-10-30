import { useState } from "react";
import { explainFailure, readJsonSafe } from "@/components/hrm/api-response";
export { explainFailure, readJsonSafe } from "@/components/hrm/api-response";

export function formatThaiDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function validateEmployeeForm(form, employee, canEditProfile, canEditCompensation) {
  if (canEditProfile) {
    if (!form.firstName.trim() || !form.lastName.trim()) return "กรุณากรอกชื่อและนามสกุล";
    if (!/^\d{4}$/.test(form.code.trim())) return "กรุณากำหนดรหัสพนักงานเป็นตัวเลข 4 หลัก เช่น 2603";
    if (!employee && !form.email.trim()) return "กรุณากรอกอีเมลเพื่อใช้เป็นชื่อเข้าสู่ระบบของพนักงาน";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "รูปแบบอีเมลไม่ถูกต้อง";
    if (!form.startDate) return "กรุณากรอกวันที่เริ่มงาน";
    if (employee && !employee.isActive && !form.endDate) return "กรุณาระบุวันที่สิ้นสุดการทำงาน";
    if (!Array.isArray(form.weeklyHolidays) || form.weeklyHolidays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(form.weeklyHolidays).size !== form.weeklyHolidays.length) return "กรุณาเลือกวันหยุดประจำสัปดาห์ให้ถูกต้อง";
  }
  if (canEditCompensation) {
    if (form.baseSalary !== "" && (!Number.isFinite(Number(form.baseSalary)) || Number(form.baseSalary) < 0)) return "ฐานเงินเดือนต้องเป็นตัวเลขตั้งแต่ 0 บาทขึ้นไป";
    if (!Number.isFinite(Number(form.otWeekdayMultiplier)) || Number(form.otWeekdayMultiplier) <= 0) return "เรท OT วันธรรมดาต้องมากกว่า 0";
    if (!Number.isFinite(Number(form.otHolidayMultiplier)) || Number(form.otHolidayMultiplier) <= 0) return "เรท OT วันหยุดต้องมากกว่า 0";
    if (!Number.isFinite(Number(form.workHoursPerDay)) || Number(form.workHoursPerDay) <= 0 || Number(form.workHoursPerDay) > 24) return "ชั่วโมงทำงานปกติต่อวันต้องมากกว่า 0 และไม่เกิน 24";
    for (const item of [...(form.payrollData?.incomeItems ?? []), ...(form.payrollData?.deductionItems ?? [])]) {
      if (item.amount !== "" && (!Number.isFinite(Number(item.amount)) || Number(item.amount) < 0)) return `จำนวนเงินของ ${item.label} ต้องเป็นตัวเลขตั้งแต่ 0 บาทขึ้นไป`;
    }
  }
  return null;
}

function employeeRequestBody(form, employee, lookups, canEditProfile, canEditCompensation) {
  const operationalStatus = lookups.employmentStatuses.find((item) => item.name === "ปฏิบัติงาน" && item.isActive !== false)
    || lookups.employmentStatuses.find((item) => item.name !== "พ้นสภาพ" && item.isActive !== false);

  const body = {
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
    baseSalary: form.baseSalary === "" ? null : Number(form.baseSalary),
    payrollData: form.payrollData ? {
      ...form.payrollData,
      incomeItems: form.payrollData.incomeItems.map((item) => ({ ...item, amount: item.amount === "" ? 0 : Number(item.amount) })),
      deductionItems: form.payrollData.deductionItems.map((item) => ({ ...item, amount: item.amount === "" ? 0 : Number(item.amount) })),
    } : undefined,
    otWeekdayMultiplier: Number(form.otWeekdayMultiplier),
    otHolidayMultiplier: Number(form.otHolidayMultiplier),
    workHoursPerDay: Number(form.workHoursPerDay),
    weeklyHolidays: [...form.weeklyHolidays],
    startDate: form.startDate,
    ...(employee ? { endDate: form.endDate || null } : {}),
    departmentId: form.departmentId ? Number(form.departmentId) : null,
    positionId: form.positionId ? Number(form.positionId) : null,
    employmentTypeId: form.employmentTypeId ? Number(form.employmentTypeId) : null,
    ...(!employee ? { employmentStatusId: operationalStatus?.id ?? null } : {}),
  };

  const compensationFields = ["baseSalary", "payrollData", "otWeekdayMultiplier", "otHolidayMultiplier", "workHoursPerDay"];
  if (canEditProfile && canEditCompensation) return body;
  if (canEditProfile) {
    for (const field of compensationFields) delete body[field];
    return body;
  }
  return Object.fromEntries(compensationFields.map((field) => [field, body[field]]));
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

  async function saveEmployee({ employee, form, lookups, canEditProfile = true, canEditCompensation = true }) {
    const validationError = validateEmployeeForm(form, employee, canEditProfile, canEditCompensation);
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
        body: employeeRequestBody(form, employee, lookups, canEditProfile, canEditCompensation),
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
