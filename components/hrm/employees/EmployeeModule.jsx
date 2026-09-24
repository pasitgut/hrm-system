"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RiAddLine,
  RiDeleteBinLine,
  RiEditLine,
  RiEyeLine,
  RiSearchLine,
  RiSettings3Line,
  RiTeamLine,
} from "@remixicon/react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Chip } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { canManageEmployees } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

const MASTER_ITEMS = [
  { key: "employmentTypes", label: "ประเภทการจ้าง", endpoint: "/api/employment-types", hasCode: true },
  { key: "employmentStatuses", label: "สถานะพนักงาน", endpoint: "/api/employment-statuses" },
  { key: "departments", label: "แผนก", endpoint: "/api/departments" },
  { key: "positions", label: "ตำแหน่ง", endpoint: "/api/positions" },
];

const EMPTY_LOOKUPS = {
  employmentTypes: [],
  employmentStatuses: [],
  departments: [],
  positions: [],
};
const NO_LOOKUP = "__none__";

const blankForm = {
  code: "",
  prefix: "คุณ",
  firstName: "",
  lastName: "",
  nickname: "",
  firstNameEn: "",
  lastNameEn: "",
  citizenId: "",
  birthDate: "",
  email: "",
  phone: "",
  departmentId: "",
  positionId: "",
  employmentTypeId: "",
  startDate: todayStr(),
  endDate: "",
  avatarUrl: "",
};

function todayStr() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function explainFailure(raw, fallback) {
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

function formatThaiDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function initialsFor(employee) {
  const initials = `${employee?.firstName?.[0] || ""}${employee?.lastName?.[0] || ""}`;
  return initials || "พน";
}

function colorForId(id = "") {
  const colors = ["lime", "blue", "pink", "orange", "purple"];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length];
}

function StatusChip({ status }) {
  if (!status) return <span className="text-sm text-muted-foreground">-</span>;
  if (status === "ปฏิบัติงาน") return <Chip variant="caption" color="lime">{status}</Chip>;
  if (status === "พ้นสภาพ") return <Chip variant="caption" color="gray">{status}</Chip>;
  return <Chip variant="caption" color="blue">{status}</Chip>;
}

function SelectField({ id, label, children, ...props }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label id={`${id}-label`} htmlFor={id} className="text-sm font-medium leading-5 text-foreground">{label}</label>
      <Select id={id} aria-labelledby={`${id}-label`} {...props}>{children}</Select>
    </div>
  );
}

function EmployeeActions({ employee, canManage, onView, onEdit, onOffboard }) {
  const name = `${employee.firstName} ${employee.lastName}`;
  return (
    <div className="flex items-center justify-end gap-1">
      <IconButton icon={RiEyeLine} aria-label={`ดูข้อมูล ${name}`} onClick={() => onView(employee)} />
      {canManage ? (
        <>
          <IconButton icon={RiEditLine} aria-label={`แก้ไข ${name}`} onClick={() => onEdit(employee)} />
          {employee.isActive ? <Button type="button" size="xs" variant="outline" className="text-destructive" aria-label={`เปลี่ยน ${name} เป็นพ้นสภาพ`} onClick={() => onOffboard(employee)}>พ้นสภาพ</Button> : null}
        </>
      ) : null}
    </div>
  );
}

function EmployeeCard({ employee, ...props }) {
  const name = `${employee.firstName} ${employee.lastName}`;
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={employee.avatarUrl} alt={name} initials={initialsFor(employee)} color={colorForId(employee.id)} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{employee.code}</p>
          </div>
        </div>
        <StatusChip status={employee.employmentStatus?.name} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-muted-foreground">แผนก</dt><dd className="mt-1 text-foreground">{employee.department?.name || "-"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">ตำแหน่ง</dt><dd className="mt-1 text-foreground">{employee.position?.name || "-"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">ประเภทการจ้าง</dt><dd className="mt-1 text-foreground">{employee.employmentType?.name || "-"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">วันที่เริ่มงาน</dt><dd className="mt-1 text-foreground">{formatThaiDate(employee.startDate)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">วันที่สิ้นสุดงาน</dt><dd className="mt-1 text-foreground">{formatThaiDate(employee.endDate)}</dd></div>
      </dl>
      <div className="mt-4 border-t border-border pt-3">
        <EmployeeActions employee={employee} {...props} />
      </div>
    </article>
  );
}

export default function EmployeeModule() {
  const { role } = useHrmRole();
  const canManage = canManageEmployees(role);

  const [lookups, setLookups] = useState(EMPTY_LOOKUPS);
  const [lookupError, setLookupError] = useState("");
  const [lookupRefresh, setLookupRefresh] = useState(0);
  const [employeeList, setEmployeeList] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [offboardingEndDate, setOffboardingEndDate] = useState(todayStr());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState(null);

  const [masterOpen, setMasterOpen] = useState(false);
  const [masterTab, setMasterTab] = useState("employmentTypes");
  const [masterEditorOpen, setMasterEditorOpen] = useState(false);
  const [editingMaster, setEditingMaster] = useState(null);
  const [masterDraft, setMasterDraft] = useState({ name: "", code: "" });
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterError, setMasterError] = useState("");
  const [masterNotice, setMasterNotice] = useState("");
  const [masterDeleteTarget, setMasterDeleteTarget] = useState(null);
  const [masterDeleting, setMasterDeleting] = useState(false);
  const [masterDeleteError, setMasterDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadLookups() {
      setLookupError("");
      try {
        const responses = await Promise.all(MASTER_ITEMS.map((item) => fetch(item.endpoint)));
        const payloads = await Promise.all(responses.map(readJsonSafe));
        const failedIndex = responses.findIndex((response) => !response.ok);
        if (failedIndex >= 0) {
          throw new Error(explainFailure(payloads[failedIndex].error, "โหลดข้อมูลรายการไม่สำเร็จ"));
        }
        const next = Object.fromEntries(MASTER_ITEMS.map((item, index) => [item.key, payloads[index].items || []]));
        if (!cancelled) setLookups(next);
      } catch (error) {
        if (!cancelled) setLookupError(error instanceof Error && !/fetch|network/i.test(error.message) ? error.message : "โหลดรายการข้อมูลไม่สำเร็จ เพราะเชื่อมต่อระบบไม่ได้");
      }
    }
    loadLookups();
    return () => { cancelled = true; };
  }, [lookupRefresh]);

  useEffect(() => {
    let cancelled = false;
    async function loadEmployees() {
      setListLoading(true);
      setListError("");
      try {
        const response = await fetch(`/api/employees${canManage ? "?includeDeleted=true" : ""}`);
        const payload = await readJsonSafe(response);
        if (!response.ok) throw new Error(explainFailure(payload.error, "โหลดรายชื่อพนักงานไม่สำเร็จ"));
        if (!cancelled) setEmployeeList(payload.items || []);
      } catch (error) {
        if (!cancelled) setListError(error instanceof Error && !/fetch|network/i.test(error.message) ? error.message : "โหลดรายชื่อพนักงานไม่สำเร็จ เพราะเชื่อมต่อระบบไม่ได้");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }
    loadEmployees();
    return () => { cancelled = true; };
  }, [canManage, refreshKey]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return employeeList.filter((employee) => {
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? employee.isActive : !employee.isActive);
      const matchesDepartment = departmentFilter === "all" || String(employee.department?.id || "") === departmentFilter;
      const matchesType = employmentTypeFilter === "all" || String(employee.employmentType?.id || "") === employmentTypeFilter;
      const searchable = `${employee.firstName} ${employee.lastName} ${employee.firstNameEn || ""} ${employee.lastNameEn || ""} ${employee.nickname || ""} ${employee.code} ${employee.email || ""} ${employee.department?.name || ""} ${employee.position?.name || ""} ${employee.employmentType?.name || ""}`.toLocaleLowerCase();
      return matchesStatus && matchesDepartment && matchesType && searchable.includes(needle);
    });
  }, [employeeList, query, statusFilter, departmentFilter, employmentTypeFilter]);

  const activeCount = employeeList.filter((employee) => employee.isActive).length;
  const formerCount = employeeList.length - activeCount;
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [query, statusFilter, departmentFilter, employmentTypeFilter]);

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...blankForm, startDate: todayStr() });
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(employee) {
    setEditing(employee);
    setForm({
      code: employee.code || "",
      prefix: employee.prefix || "คุณ",
      firstName: employee.firstName || "",
      lastName: employee.lastName || "",
      nickname: employee.nickname || "",
      firstNameEn: employee.firstNameEn || "",
      lastNameEn: employee.lastNameEn || "",
      citizenId: employee.citizenId || "",
      birthDate: employee.birthDate || "",
      email: employee.email || "",
      phone: employee.phone || "",
      departmentId: employee.department ? String(employee.department.id) : "",
      positionId: employee.position ? String(employee.position.id) : "",
      employmentTypeId: employee.employmentType ? String(employee.employmentType.id) : "",
      startDate: employee.startDate || "",
      endDate: employee.endDate || "",
      avatarUrl: employee.avatarUrl || "",
    });
    setFormError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setFormError("");
  }

  async function saveEmployee(event) {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError("กรุณากรอกชื่อและนามสกุล");
      return;
    }
    if (!/^\d{4}$/.test(form.code.trim())) {
      setFormError("กรุณากำหนดรหัสพนักงานเป็นตัวเลข 4 หลัก เช่น 2603");
      return;
    }
    if (!editing && !form.email.trim()) {
      setFormError("กรุณากรอกอีเมลเพื่อใช้เป็นชื่อเข้าสู่ระบบของพนักงาน");
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFormError("รูปแบบอีเมลไม่ถูกต้อง");
      return;
    }
    if (!form.startDate) {
      setFormError("กรุณากรอกวันที่เริ่มงาน");
      return;
    }
    if (editing && !editing.isActive && !form.endDate) {
      setFormError("กรุณาระบุวันที่สิ้นสุดการทำงาน");
      return;
    }
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
      startDate: form.startDate,
      ...(editing ? { endDate: form.endDate || null } : {}),
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      positionId: form.positionId ? Number(form.positionId) : null,
      employmentTypeId: form.employmentTypeId ? Number(form.employmentTypeId) : null,
      ...(!editing ? { employmentStatusId: operationalStatus?.id ?? null } : {}),
    };

    setSaving(true);
    setFormError("");
    try {
      const response = await fetch(editing ? `/api/employees/${editing.id}` : "/api/employees", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setFormError(explainFailure(payload.error, "บันทึกข้อมูลพนักงานไม่สำเร็จ"));
        return;
      }
      const name = `${payload.item.firstName} ${payload.item.lastName}`;
      setNotice({ type: "success", message: editing ? `บันทึกข้อมูล ${name} สำเร็จ` : `เพิ่มพนักงาน ${name} สำเร็จ รหัส ${payload.item.code} · รหัสผ่านเริ่มต้นคือ ${payload.item.code} และต้องเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก` });
      if (selected?.id === payload.item.id) setSelected(payload.item);
      setFormOpen(false);
      setEditing(null);
      setPage(1);
      setRefreshKey((current) => current + 1);
    } catch {
      setFormError("บันทึกข้อมูลพนักงานไม่สำเร็จ เพราะเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  function beginOffboard(employee) {
    setDeleteTarget(employee);
    setOffboardingEndDate(todayStr());
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (!offboardingEndDate) {
      setDeleteError("กรุณาระบุวันที่สิ้นสุดการทำงาน");
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/employees/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: offboardingEndDate }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setDeleteError(explainFailure(payload.error, "เปลี่ยนสถานะพนักงานเป็นพ้นสภาพไม่สำเร็จ"));
        return;
      }
      setNotice({ type: "success", message: `เปลี่ยนสถานะ ${deleteTarget.firstName} ${deleteTarget.lastName} เป็นพ้นสภาพสำเร็จ วันที่สิ้นสุดงาน ${formatThaiDate(payload.item?.endDate || offboardingEndDate)}` });
      if (selected?.id === deleteTarget.id) setSelected(payload.item || null);
      setDeleteTarget(null);
      setPage(1);
      setRefreshKey((current) => current + 1);
    } catch {
      setDeleteError("เปลี่ยนสถานะพนักงานเป็นพ้นสภาพไม่สำเร็จ เพราะเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่");
    } finally {
      setDeleting(false);
    }
  }

  function beginMasterEdit(item) {
    setEditingMaster(item);
    setMasterDraft({ name: item.name || "", code: item.code || "" });
    setMasterError("");
    setMasterNotice("");
    setMasterEditorOpen(true);
  }

  function beginMasterCreate() {
    setEditingMaster(null);
    setMasterDraft({ name: "", code: "" });
    setMasterError("");
    setMasterNotice("");
    setMasterEditorOpen(true);
  }

  async function saveMaster(event) {
    event.preventDefault();
    const config = MASTER_ITEMS.find((item) => item.key === masterTab);
    if (!config) return;
    if (!masterDraft.name.trim()) {
      setMasterError("กรุณากรอกชื่อรายการ");
      return;
    }
    if (config.hasCode && !masterDraft.code.trim()) {
      setMasterError("กรุณากรอกรหัสประเภทการจ้าง");
      return;
    }
    setMasterSaving(true);
    setMasterError("");
    try {
      const response = await fetch(editingMaster ? `${config.endpoint}/${editingMaster.id}` : config.endpoint, {
        method: editingMaster ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config.hasCode
          ? { name: masterDraft.name.trim(), code: masterDraft.code.trim() }
          : { name: masterDraft.name.trim() }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setMasterError(explainFailure(payload.error, "บันทึกรายการไม่สำเร็จ"));
        return;
      }
      const item = payload.item;
      setLookups((current) => ({
        ...current,
        [masterTab]: [...current[masterTab].filter((entry) => entry.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name, "th")),
      }));
      setMasterNotice(`${editingMaster ? "แก้ไข" : "เพิ่ม"}${config.label} “${item.name}” สำเร็จ`);
      setMasterEditorOpen(false);
      setEditingMaster(null);
      setMasterDraft({ name: "", code: "" });
      setPage(1);
      setRefreshKey((current) => current + 1);
    } catch {
      setMasterError("บันทึกรายการไม่สำเร็จ เพราะเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่");
    } finally {
      setMasterSaving(false);
    }
  }

  async function confirmMasterDelete() {
    if (!masterDeleteTarget) return;
    const config = MASTER_ITEMS.find((item) => item.key === masterTab);
    if (!config) return;
    setMasterDeleting(true);
    setMasterDeleteError("");
    try {
      const response = await fetch(`${config.endpoint}/${masterDeleteTarget.id}`, { method: "DELETE" });
      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setMasterDeleteError(explainFailure(payload.error, `ลบ${config.label}ไม่สำเร็จ`));
        return;
      }
      setLookups((current) => ({
        ...current,
        [masterTab]: current[masterTab].filter((entry) => entry.id !== masterDeleteTarget.id),
      }));
      setMasterNotice(`ลบ${config.label} “${masterDeleteTarget.name}” สำเร็จ และล้างข้อมูลที่พนักงานอ้างอิงแล้ว`);
      setMasterDeleteTarget(null);
      setMasterEditorOpen(false);
      setEditingMaster(null);
      setSelected(null);
      setLookupRefresh((current) => current + 1);
      setRefreshKey((current) => current + 1);
    } catch {
      setMasterDeleteError(`ลบ${config.label}ไม่สำเร็จ เพราะเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่`);
    } finally {
      setMasterDeleting(false);
    }
  }

  const currentMaster = MASTER_ITEMS.find((item) => item.key === masterTab) || MASTER_ITEMS[0];
  const currentMasterItems = lookups[masterTab] || [];
  const activeDepartments = lookups.departments.filter((item) => item.isActive !== false);
  const activePositions = lookups.positions.filter((item) => item.isActive !== false);
  const activeTypes = lookups.employmentTypes.filter((item) => item.isActive !== false);

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">HRM / ทะเบียนพนักงาน</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">ทะเบียนพนักงาน</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">จัดการข้อมูลพนักงาน แผนก ตำแหน่ง และประเภทการจ้างในที่เดียว</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" leadingIcon={RiSettings3Line} onClick={() => setMasterOpen(true)}>จัดการรายการ</Button>
            <Button type="button" leadingIcon={RiAddLine} onClick={openAdd}>เพิ่มพนักงาน</Button>
          </div>
        ) : null}
      </section>

      {notice ? (
        <div role="status" aria-live="polite" className={cn("flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm", notice.type === "success" ? "border-status-success/30 bg-status-success/5 text-foreground" : "border-status-danger/30 bg-status-danger/5 text-status-danger")}>
          <span className="font-medium">{notice.message}</span>
          <button type="button" className="rounded px-2 text-xs underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setNotice(null)}>ปิด</button>
        </div>
      ) : null}

      <section aria-label="กรองตามสถานะพนักงาน" className="flex gap-2 overflow-x-auto border-b border-border">
        {[
          { key: "all", label: "ทั้งหมด", count: employeeList.length },
          { key: "active", label: "ปฏิบัติงาน", count: activeCount },
          ...(canManage ? [{ key: "former", label: "พ้นสภาพ", count: formerCount }] : []),
        ].map((item) => (
          <button
            type="button"
            key={item.key}
            aria-pressed={statusFilter === item.key}
            onClick={() => setStatusFilter(item.key)}
            className={cn("min-h-10 shrink-0 border-b-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", statusFilter === item.key ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {item.label}<span className="ml-2 text-xs text-muted-foreground">{item.count}</span>
          </button>
        ))}
      </section>

      {(lookupError || listError) ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-status-danger/30 bg-status-danger/5 px-4 py-3 text-sm text-status-danger">
          <span>{lookupError || listError}</span>
          <div className="flex gap-2">
            {lookupError ? <Button type="button" size="small" variant="outline" onClick={() => setLookupRefresh((current) => current + 1)}>โหลดรายการใหม่</Button> : null}
            {listError ? <Button type="button" size="small" variant="outline" onClick={() => setRefreshKey((current) => current + 1)}>โหลดรายชื่อใหม่</Button> : null}
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid gap-3 border-b border-border p-3 sm:p-4 xl:grid-cols-[minmax(15rem,1fr)_13rem_13rem] xl:items-center">
          <Input aria-label="ค้นหาพนักงาน" placeholder="ค้นหาชื่อ รหัส หรืออีเมล" value={query} onChange={setQuery} leadingIcon={RiSearchLine} />
          <Select aria-label="กรองตามแผนก" selectedKey={departmentFilter} onSelectionChange={(key) => setDepartmentFilter(String(key))} size="sm">
            <SelectItem id="all">ทุกแผนก</SelectItem>
            {activeDepartments.map((item) => <SelectItem id={String(item.id)} key={item.id}>{item.name}</SelectItem>)}
          </Select>
          <Select aria-label="กรองตามประเภทการจ้าง" selectedKey={employmentTypeFilter} onSelectionChange={(key) => setEmploymentTypeFilter(String(key))} size="sm">
            <SelectItem id="all">ทุกประเภทการจ้าง</SelectItem>
            {activeTypes.map((item) => <SelectItem id={String(item.id)} key={item.id}>{item.name}</SelectItem>)}
          </Select>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-muted/70">
              <tr className="text-xs font-semibold text-muted-foreground">
                <th scope="col" className="px-4 py-3">รหัส</th>
                <th scope="col" className="px-4 py-3">พนักงาน</th>
                <th scope="col" className="px-4 py-3">แผนก / ตำแหน่ง</th>
                <th scope="col" className="px-4 py-3">ประเภทการจ้าง</th>
                <th scope="col" className="px-4 py-3">วันที่เริ่ม / สิ้นสุดงาน</th>
                <th scope="col" className="px-4 py-3">สถานะ</th>
                <th scope="col" className="px-4 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((employee) => {
                const name = `${employee.firstName} ${employee.lastName}`;
                return (
                  <tr key={employee.id} className="border-t border-border transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">{employee.code}</td>
                    <td className="min-w-64 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar src={employee.avatarUrl} alt={name} initials={initialsFor(employee)} color={colorForId(employee.id)} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{name}{employee.nickname ? <span className="ml-1 text-muted-foreground">({employee.nickname})</span> : null}</p>
                          <p className="truncate text-xs text-muted-foreground">{employee.email || "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="min-w-48 px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{employee.department?.name || "-"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{employee.position?.name || "-"}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{employee.employmentType?.name || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                      <p>{formatThaiDate(employee.startDate)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">สิ้นสุด: {formatThaiDate(employee.endDate)}</p>
                    </td>
                    <td className="px-4 py-3"><StatusChip status={employee.employmentStatus?.name} /></td>
                    <td className="px-3 py-3"><EmployeeActions employee={employee} canManage={canManage} onView={setSelected} onEdit={openEdit} onOffboard={beginOffboard} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {pageItems.map((employee) => <EmployeeCard key={employee.id} employee={employee} canManage={canManage} onView={setSelected} onEdit={openEdit} onOffboard={beginOffboard} />)}
        </div>

        {listLoading ? (
          <div className="space-y-3 p-4" aria-label="กำลังโหลดรายชื่อพนักงาน">
            {[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-md bg-muted" />)}
          </div>
        ) : null}
        {!listLoading && !listError && filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <RiTeamLine className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">ไม่พบพนักงานที่ตรงกับตัวกรอง</p>
            <p className="mt-1 text-sm text-muted-foreground">ลองเปลี่ยนคำค้นหา แผนก หรือประเภทการจ้าง</p>
          </div>
        ) : null}
        {!listLoading && !listError && filtered.length > 0 ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>แสดง {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} จาก {filtered.length} รายการ</span>
            <div className="flex items-center gap-2">
              <Button type="button" size="small" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
              <span aria-live="polite">หน้า {page} จาก {pageCount}</span>
              <Button type="button" size="small" variant="outline" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>ถัดไป</Button>
            </div>
          </footer>
        ) : null}
      </section>

      <HrmDialog
        open={formOpen}
        onClose={closeForm}
        title={editing ? "แก้ไขข้อมูลพนักงาน" : "เพิ่มพนักงาน"}
        description="กำหนดรหัสพนักงานเองเป็นตัวเลข 4 หลัก เช่น 2603"
        size="lg"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-t-4 border-t-primary"
        footer={<><Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>ยกเลิก</Button><Button type="submit" form="employee-form" disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</Button></>}
      >
        <form id="employee-form" className="grid gap-4 sm:grid-cols-2" onSubmit={saveEmployee} noValidate>
          <div className="sm:col-span-2 border-b border-border pb-3">
            <h3 className="text-sm font-semibold text-foreground">ข้อมูลส่วนบุคคล</h3>
            <p className="mt-1 text-xs text-muted-foreground">กรอกข้อมูลที่จำเป็นให้ครบก่อนบันทึก</p>
          </div>
          <Input label="รหัสพนักงาน *" placeholder="กรอกรหัสเอง เช่น 2603" value={form.code} onChange={(value) => { updateForm("code", value); setFormError(""); }} inputMode="numeric" maxLength={4} isRequired aria-describedby="employee-code-help" />
          <p id="employee-code-help" className="self-end pb-2 text-xs text-muted-foreground">กำหนดเอง เช่น 2603 และห้ามซ้ำกับพนักงานคนอื่น</p>
          <SelectField id="employee-prefix" label="คำนำหน้า" selectedKey={form.prefix} onSelectionChange={(key) => updateForm("prefix", String(key))}>
            <SelectItem id="นาย">นาย</SelectItem><SelectItem id="นาง">นาง</SelectItem><SelectItem id="นางสาว">นางสาว</SelectItem><SelectItem id="คุณ">คุณ</SelectItem>
          </SelectField>
          <Input label="ชื่อ (ไทย) *" value={form.firstName} onChange={(value) => updateForm("firstName", value)} isRequired />
          <Input label="นามสกุล (ไทย) *" value={form.lastName} onChange={(value) => updateForm("lastName", value)} isRequired />
          <Input label="ชื่อเล่น" value={form.nickname} onChange={(value) => updateForm("nickname", value)} />
          <Input label="ชื่อ (อังกฤษ)" value={form.firstNameEn} onChange={(value) => updateForm("firstNameEn", value)} />
          <Input label="นามสกุล (อังกฤษ)" value={form.lastNameEn} onChange={(value) => updateForm("lastNameEn", value)} />
          <Input label="เลขบัตรประชาชน" value={form.citizenId} onChange={(value) => updateForm("citizenId", value)} />
          <Input label="วันเกิด" type="date" value={form.birthDate} onChange={(value) => updateForm("birthDate", value)} />
          <Input label={editing ? "อีเมล" : "อีเมล *"} type="email" value={form.email} onChange={(value) => updateForm("email", value)} isRequired={!editing || Boolean(form.email)} />
          {!editing ? <p className="self-end pb-2 text-xs leading-5 text-muted-foreground sm:col-span-2">ใช้เข้าสู่ระบบได้ด้วยอีเมลหรือรหัสพนักงาน โดยรหัสผ่านเริ่มต้นคือรหัสพนักงานและต้องเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก</p> : null}
          <Input label="โทรศัพท์" type="tel" value={form.phone} onChange={(value) => updateForm("phone", value)} />

          <div className="sm:col-span-2 border-b border-border pb-3 pt-2">
            <h3 className="text-sm font-semibold text-foreground">ข้อมูลการจ้างงาน</h3>
          </div>
          <SelectField id="employee-department" label="แผนก" selectedKey={form.departmentId || NO_LOOKUP} onSelectionChange={(key) => updateForm("departmentId", key == null || key === NO_LOOKUP ? "" : String(key))}>
            <SelectItem id={NO_LOOKUP}>ไม่ระบุ</SelectItem>
            {activeDepartments.map((item) => <SelectItem id={String(item.id)} key={item.id}>{item.name}</SelectItem>)}
          </SelectField>
          <SelectField id="employee-position" label="ตำแหน่ง" selectedKey={form.positionId || NO_LOOKUP} onSelectionChange={(key) => updateForm("positionId", key == null || key === NO_LOOKUP ? "" : String(key))}>
            <SelectItem id={NO_LOOKUP}>ไม่ระบุ</SelectItem>
            {activePositions.map((item) => <SelectItem id={String(item.id)} key={item.id}>{item.name}</SelectItem>)}
          </SelectField>
          <SelectField id="employee-type" label="ประเภทการจ้าง" selectedKey={form.employmentTypeId || NO_LOOKUP} onSelectionChange={(key) => updateForm("employmentTypeId", key == null || key === NO_LOOKUP ? "" : String(key))}>
            <SelectItem id={NO_LOOKUP}>ไม่ระบุ</SelectItem>
            {activeTypes.map((item) => <SelectItem id={String(item.id)} key={item.id}>{item.name}</SelectItem>)}
          </SelectField>
          <Input label="วันที่เริ่มงาน *" type="date" value={form.startDate} onChange={(value) => updateForm("startDate", value)} isRequired />
          {editing && !editing.isActive ? <Input label="วันที่สิ้นสุดการทำงาน" type="date" value={form.endDate} onChange={(value) => updateForm("endDate", value)} /> : null}
          <Input
            label="รูปโปรไฟล์"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (!file.type.startsWith("image/")) { setFormError("เลือกรูปไม่สำเร็จ เพราะไฟล์ไม่ใช่รูปภาพ"); return; }
              if (file.size > 5 * 1024 * 1024) { setFormError("เลือกรูปไม่สำเร็จ เพราะไฟล์มีขนาดเกิน 5 MB"); return; }
              const reader = new FileReader();
              reader.onload = () => { if (typeof reader.result === "string") updateForm("avatarUrl", reader.result); };
              reader.onerror = () => setFormError("อ่านไฟล์รูปไม่สำเร็จ กรุณาเลือกรูปอื่น");
              reader.readAsDataURL(file);
            }}
          />
          {form.avatarUrl ? <div className="flex items-center gap-3 text-xs text-muted-foreground"><Avatar src={form.avatarUrl} alt="รูปพนักงาน" initials={initialsFor(form)} /><span>เลือกรูปแล้ว</span></div> : <p className="self-end pb-2 text-xs text-muted-foreground">JPG หรือ PNG ขนาดไม่เกิน 5 MB</p>}
          {formError ? <p role="alert" className="sm:col-span-2 rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-sm text-status-danger">{formError}</p> : null}
        </form>
      </HrmDialog>

      <HrmDialog
        open={Boolean(deleteTarget)}
        onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(""); } }}
        title="ยืนยันการเปลี่ยนสถานะพนักงาน"
        description="ระบบจะเก็บข้อมูลและประวัติของพนักงานไว้ พร้อมบันทึกวันที่สิ้นสุดการทำงาน"
        size="sm"
        footer={<><Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>ยกเลิก</Button><Button type="button" variant="danger" onClick={confirmDelete} disabled={deleting}>{deleting ? "กำลังดำเนินการ..." : "ยืนยันพ้นสภาพ"}</Button></>}
      >
        <p className="text-sm text-foreground">เปลี่ยน <strong>{deleteTarget ? `${deleteTarget.firstName} ${deleteTarget.lastName}` : ""}</strong> เป็นพ้นสภาพในวันที่</p>
        <Input className="mt-3" label="วันที่สิ้นสุดการทำงาน" type="date" value={offboardingEndDate} onChange={(value) => { setOffboardingEndDate(value); setDeleteError(""); }} isRequired />
        {deleteError ? <p role="alert" className="mt-3 rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-sm text-status-danger">{deleteError}</p> : null}
      </HrmDialog>

      <HrmDialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="ข้อมูลพนักงาน"
        description={selected ? `${selected.code} / ${selected.department?.name || "-"} / ${selected.position?.name || "-"}` : ""}
        size="md"
        footer={<><Button type="button" variant="secondary" onClick={() => setSelected(null)}>ปิด</Button>{canManage ? <Button type="button" leadingIcon={RiEditLine} onClick={() => { const employee = selected; setSelected(null); openEdit(employee); }}>แก้ไขข้อมูล</Button> : null}</>}
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar src={selected.avatarUrl} alt={`${selected.firstName} ${selected.lastName}`} initials={initialsFor(selected)} color={colorForId(selected.id)} size="lg" />
              <div><h3 className="font-semibold text-foreground">{selected.prefix || ""}{selected.firstName} {selected.lastName}</h3><p className="mt-1 text-sm text-muted-foreground">{selected.nickname ? `ชื่อเล่น ${selected.nickname}` : selected.code}</p></div>
              <div className="ml-auto"><StatusChip status={selected.employmentStatus?.name} /></div>
            </div>
            <dl className="grid gap-x-5 gap-y-4 border-t border-border pt-4 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">ชื่อ (อังกฤษ)</dt><dd className="mt-1 text-sm text-foreground">{`${selected.firstNameEn || ""} ${selected.lastNameEn || ""}`.trim() || "-"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">อีเมล</dt><dd className="mt-1 text-sm text-foreground">{selected.email || "-"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">โทรศัพท์</dt><dd className="mt-1 text-sm text-foreground">{selected.phone || "-"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">เลขบัตรประชาชน</dt><dd className="mt-1 text-sm text-foreground">{selected.citizenId || "-"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">แผนก</dt><dd className="mt-1 text-sm text-foreground">{selected.department?.name || "-"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">ตำแหน่ง</dt><dd className="mt-1 text-sm text-foreground">{selected.position?.name || "-"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">ประเภทการจ้าง</dt><dd className="mt-1 text-sm text-foreground">{selected.employmentType?.name || "-"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">วันที่เริ่มงาน</dt><dd className="mt-1 text-sm text-foreground">{formatThaiDate(selected.startDate)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">วันที่สิ้นสุดงาน</dt><dd className="mt-1 text-sm text-foreground">{formatThaiDate(selected.endDate)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">วันเกิด</dt><dd className="mt-1 text-sm text-foreground">{formatThaiDate(selected.birthDate)}</dd></div>
            </dl>
          </div>
        ) : null}
      </HrmDialog>

      <HrmDialog
        open={masterOpen}
        onClose={() => { if (!masterSaving && !masterDeleting) { setMasterOpen(false); setMasterEditorOpen(false); setMasterError(""); } }}
        title="จัดการรายการพนักงาน"
        description="เพิ่ม แก้ไข หรือลบประเภทการจ้าง สถานะพนักงาน แผนก และตำแหน่ง"
        size="lg"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <div className="space-y-4">
          <div role="tablist" aria-label="ประเภทข้อมูลที่จัดการ" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MASTER_ITEMS.map((item) => (
              <button
                type="button"
                role="tab"
                id={`master-tab-${item.key}`}
                aria-selected={masterTab === item.key}
                aria-controls="master-panel"
                key={item.key}
                onClick={() => { setMasterTab(item.key); setMasterEditorOpen(false); setMasterError(""); setMasterNotice(""); }}
                className={cn("min-h-10 rounded-md border px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", masterTab === item.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted")}
              >
                {item.label}
              </button>
            ))}
          </div>
          {masterNotice ? <div role="status" aria-live="polite" className="rounded-md border border-status-success/30 bg-status-success/5 px-3 py-2 text-sm text-foreground">{masterNotice}</div> : null}
          <section id="master-panel" role="tabpanel" aria-labelledby={`master-tab-${masterTab}`} className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div><h3 className="text-sm font-semibold text-foreground">{currentMaster.label}</h3><p className="mt-1 text-xs text-muted-foreground">{currentMasterItems.length} รายการ</p></div>
              <Button type="button" size="small" leadingIcon={RiAddLine} onClick={beginMasterCreate}>เพิ่ม{currentMaster.label}</Button>
            </div>

            {masterEditorOpen ? (
              <form className="my-4 grid gap-3 rounded-md border border-border bg-muted/40 p-3 sm:grid-cols-2" onSubmit={saveMaster}>
                {currentMaster.hasCode ? <Input label="รหัสประเภท *" value={masterDraft.code} onChange={(value) => setMasterDraft((current) => ({ ...current, code: value }))} isRequired /> : null}
                <Input label={`${currentMaster.label} *`} value={masterDraft.name} onChange={(value) => setMasterDraft((current) => ({ ...current, name: value }))} isRequired />
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button type="submit" size="small" disabled={masterSaving}>{masterSaving ? "กำลังบันทึก..." : editingMaster ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}</Button>
                  <Button type="button" size="small" variant="secondary" disabled={masterSaving} onClick={() => { setMasterEditorOpen(false); setMasterError(""); }}>ยกเลิก</Button>
                </div>
                {masterError ? <p role="alert" className="sm:col-span-2 text-sm text-status-danger">{masterError}</p> : null}
              </form>
            ) : null}

            <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border">
              {currentMasterItems.length ? currentMasterItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    {currentMaster.hasCode ? <p className="mt-0.5 font-mono text-xs text-muted-foreground">{item.code}</p> : null}
                    {item.isActive === false ? <p className="mt-0.5 text-xs text-muted-foreground">ปิดใช้งาน</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" size="small" variant="outline" leadingIcon={RiEditLine} onClick={() => beginMasterEdit(item)}>แก้ไข</Button>
                    <Button type="button" size="small" variant="danger" leadingIcon={RiDeleteBinLine} onClick={() => { setMasterDeleteTarget(item); setMasterDeleteError(""); }}>ลบ</Button>
                  </div>
                </div>
              )) : (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">ยังไม่มีรายการ กด “เพิ่ม{currentMaster.label}” เพื่อเริ่มต้น</p>
              )}
            </div>
          </section>
        </div>
      </HrmDialog>

      <HrmDialog
        open={Boolean(masterDeleteTarget)}
        onClose={() => { if (!masterDeleting) { setMasterDeleteTarget(null); setMasterDeleteError(""); } }}
        title={`ยืนยันการลบ${currentMaster.label}`}
        description="ข้อมูลพนักงานเดิมจะยังอยู่ แต่ช่องที่อ้างอิงรายการนี้จะถูกล้างเป็นค่าว่าง"
        size="sm"
        footer={<><Button type="button" variant="secondary" onClick={() => setMasterDeleteTarget(null)} disabled={masterDeleting}>ยกเลิก</Button><Button type="button" variant="danger" onClick={confirmMasterDelete} disabled={masterDeleting}>{masterDeleting ? "กำลังลบ..." : "ยืนยันลบ"}</Button></>}
      >
        <p className="text-sm text-foreground">ต้องการลบ <strong>{masterDeleteTarget?.name}</strong> ใช่หรือไม่</p>
        {masterDeleteError ? <p role="alert" className="mt-3 rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-sm text-status-danger">{masterDeleteError}</p> : null}
      </HrmDialog>
    </div>
  );
}
