"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RiAddLine,
  RiDeleteBinLine,
  RiEditLine,
  RiEyeLine,
  RiMoneyDollarCircleLine,
  RiSearchLine,
  RiSettings3Line,
  RiTeamLine,
} from "@remixicon/react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Chip } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Select, SelectItem } from "@/components/ui/select";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { HrmDialog } from "@/components/hrm/HrmDialog";
import { PageHeader } from "@/components/hrm/PageHeader";
import { IntegrationFeatureNotice } from "@/components/hrm/IntegrationNotice";
import { EmployeeDocumentsPanel } from "@/components/hrm/employees/EmployeeDocumentsPanel";
import {
  canCreateEmployees,
  canDeleteEmployeeDocuments,
  canOffboardEmployees,
  canShareEmployeeDocuments,
  canUpdateEmployeeProfiles,
  canUploadEmployeeDocuments,
  canViewEmployeeCompensation,
  canViewEmployeeDocuments,
} from "@/lib/auth/permissions";
import { canManageEmployeeCompensation } from "@/lib/auth/rolePermissionAccess";
import { cn } from "@/lib/utils";
import { explainFailure, readJsonSafe } from "@/components/hrm/api-response";
import { formatThaiDate, useEmployeeWorkflow } from "@/components/hrm/employees/employee-workflow";
import { useMasterDataWorkflow } from "@/components/hrm/employees/master-data-workflow";
import { createDefaultEmployeePayrollData, normalizeEmployeePayrollData, PAYROLL_VALUE_UNITS } from "@/lib/employees/payroll-data";
import { uploadImage } from "@/lib/client/upload-image";

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
  baseSalary: "",
  payrollData: createDefaultEmployeePayrollData(),
  otWeekdayMultiplier: "1.5",
  otHolidayMultiplier: "3",
  workHoursPerDay: "8",
  weeklyHolidays: [],
};

const WEEKLY_DAYS = [
  { value: 1, label: "วันจันทร์" },
  { value: 2, label: "วันอังคาร" },
  { value: 3, label: "วันพุธ" },
  { value: 4, label: "วันพฤหัสบดี" },
  { value: 5, label: "วันศุกร์" },
  { value: 6, label: "วันเสาร์" },
  { value: 0, label: "วันอาทิตย์" },
];

function weeklyHolidayLabel(days) {
  if (!Array.isArray(days) || days.length === 0) return "ยังไม่ได้กำหนด";
  return WEEKLY_DAYS.filter((day) => days.includes(day.value)).map((day) => day.label).join(", ");
}

function todayStr(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] || 0;
}

function parseDateParts(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const lastDay = daysInMonth(year, month);
  if (!lastDay || day < 1 || day > lastDay) return null;
  return { year, month, day };
}

function dateOrdinal({ year, month, day }) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() / 86_400_000;
}

function addMonthsClamped(date, monthCount) {
  const monthIndex = date.year * 12 + date.month - 1 + monthCount;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function formatEmploymentTenure(employee, asOfDate) {
  const startDate = parseDateParts(employee?.startDate);
  const endDate = parseDateParts(employee?.endDate || asOfDate);
  if (!startDate || !endDate) return "-";
  if (dateOrdinal(endDate) < dateOrdinal(startDate)) return "ยังไม่เริ่มงาน";

  let monthCount = (endDate.year - startDate.year) * 12 + endDate.month - startDate.month;
  if (dateOrdinal(addMonthsClamped(startDate, monthCount)) > dateOrdinal(endDate)) monthCount -= 1;

  const completedMonths = addMonthsClamped(startDate, monthCount);
  const years = Math.floor(monthCount / 12);
  const months = monthCount % 12;
  const days = dateOrdinal(endDate) - dateOrdinal(completedMonths);
  return `${years} ปี ${months} เดือน ${days} วัน`;
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

function PayrollItemsTable({ items, onChange, disabled, idPrefix }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="h-10 px-3 font-medium">รหัสรายการ</th>
            <th scope="col" className="px-3 font-medium">ชื่อรายการ</th>
            <th scope="col" className="w-48 px-3 text-right font-medium">จำนวน</th>
            <th scope="col" className="w-36 px-3 font-medium">หน่วยเวลา</th>
            <th scope="col" className="w-24 px-3 text-center font-medium">ใช้งาน</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const rowId = `${idPrefix}-${item.code}-${index}`;
            return (
              <tr key={rowId} className="border-t border-border">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">{item.code}</td>
                <td className="px-3 py-2.5 text-foreground">{item.label}</td>
                <td className="px-3 py-2">
                  <Input
                    aria-label={`จำนวน ${item.label}`}
                    className="min-w-28"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={item.amount ?? ""}
                    onChange={(value) => onChange(index, { amount: value })}
                    isDisabled={disabled}
                  />
                </td>
                <td className="px-3 py-2">
                  <Select
                    id={`${rowId}-unit`}
                    aria-label={`หน่วยเวลาของ ${item.label}`}
                    selectedKey={item.unit}
                    onSelectionChange={(key) => onChange(index, { unit: String(key) })}
                    isDisabled={disabled || item.lockUnit}
                  >
                    {PAYROLL_VALUE_UNITS.map((unit) => <SelectItem id={unit.id} key={unit.id}>{unit.label}</SelectItem>)}
                  </Select>
                </td>
                <td className="px-3 py-2 text-center">
                  <label htmlFor={`${rowId}-enabled`} className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center">
                    <Checkbox
                      id={`${rowId}-enabled`}
                      aria-label={`เปิดใช้งาน ${item.label}`}
                      isSelected={item.enabled}
                      isDisabled={disabled || item.lockEnabled}
                      onChange={(enabled) => onChange(index, { enabled })}
                    />
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmployeePayrollSettings({ form, updateForm, canManage }) {
  const [activeList, setActiveList] = useState("incomeItems");
  const payrollData = form.payrollData || createDefaultEmployeePayrollData();
  const incomeItems = [
    { code: "INT001", label: "เงินเดือน", amount: form.baseSalary ?? "", unit: "period", enabled: true, lockUnit: true, lockEnabled: true },
    ...payrollData.incomeItems,
  ];

  function updatePayrollField(field, value) {
    updateForm("payrollData", { ...payrollData, [field]: value });
  }

  function updateItem(listName, index, changes) {
    if (listName === "incomeItems" && index === 0) {
      if ("amount" in changes) updateForm("baseSalary", changes.amount);
      return;
    }
    const listIndex = listName === "incomeItems" ? index - 1 : index;
    const current = payrollData[listName];
    updatePayrollField(listName, current.map((item, itemIndex) => itemIndex === listIndex ? { ...item, ...changes } : item));
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="employee-payroll-payment-title" className="space-y-3">
        <div>
          <h3 id="employee-payroll-payment-title" className="text-sm font-semibold text-foreground">ข้อมูลการจ่ายเงิน</h3>
          <p className="mt-1 text-xs text-muted-foreground">ข้อมูลบัญชีและการตั้งค่าที่ใช้กับสลิปเงินเดือนของพนักงาน</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="ชื่อธนาคาร" value={payrollData.bankName} onChange={(value) => updatePayrollField("bankName", value)} isDisabled={!canManage} />
          <Input label="สาขาธนาคาร" value={payrollData.bankBranch} onChange={(value) => updatePayrollField("bankBranch", value)} isDisabled={!canManage} />
          <Input label="ชื่อบัญชี" value={payrollData.accountName} onChange={(value) => updatePayrollField("accountName", value)} isDisabled={!canManage} />
          <Input label="เลขที่บัญชี" inputMode="numeric" value={payrollData.accountNumber} onChange={(value) => updatePayrollField("accountNumber", value)} isDisabled={!canManage} />
          <SelectField id="employee-payroll-tax" label="เงื่อนไขภาษี" selectedKey={payrollData.taxCondition} onSelectionChange={(key) => updatePayrollField("taxCondition", String(key))} isDisabled={!canManage}>
            <SelectItem id="withhold">หัก ณ ที่จ่าย</SelectItem>
            <SelectItem id="no_withholding">ไม่หัก ณ ที่จ่าย</SelectItem>
          </SelectField>
          <SelectField id="employee-payslip-language" label="ภาษา payslip" selectedKey={payrollData.payslipLanguage} onSelectionChange={(key) => updatePayrollField("payslipLanguage", String(key))} isDisabled={!canManage}>
            <SelectItem id="th">ไทย</SelectItem>
            <SelectItem id="en">อังกฤษ</SelectItem>
          </SelectField>
          <label htmlFor="employee-do-not-print-payslip" className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-foreground sm:col-span-2">
            <Checkbox id="employee-do-not-print-payslip" isSelected={payrollData.doNotPrintPayslip} isDisabled={!canManage} onChange={(checked) => updatePayrollField("doNotPrintPayslip", checked)} />
            ไม่พิมพ์ payslip
          </label>
        </div>
      </section>

      <section aria-labelledby="employee-payroll-items-title" className="space-y-3">
        <div>
          <h3 id="employee-payroll-items-title" className="text-sm font-semibold text-foreground">รายการรายได้และรายหัก</h3>
          <p className="mt-1 text-xs text-muted-foreground">กำหนดยอดประจำ หน่วยเวลา และสถานะการใช้งานของแต่ละรายการ</p>
        </div>
        <Tabs selectedKey={activeList} onSelectionChange={(key) => setActiveList(String(key))}>
          <TabList aria-label="ประเภทรายการเงินเดือน">
            <Tab id="incomeItems">รายได้</Tab>
            <Tab id="deductionItems">รายหัก</Tab>
          </TabList>
          <TabPanel id="incomeItems" className="mt-3">
            <h4 className="mb-2 text-sm font-medium text-foreground">กำหนดรายได้ (ค่าคงที่)</h4>
            <PayrollItemsTable items={incomeItems} onChange={(index, changes) => updateItem("incomeItems", index, changes)} disabled={!canManage} idPrefix="employee-income" />
          </TabPanel>
          <TabPanel id="deductionItems" className="mt-3">
            <h4 className="mb-2 text-sm font-medium text-foreground">กำหนดรายหัก (ค่าคงที่)</h4>
            <PayrollItemsTable items={payrollData.deductionItems} onChange={(index, changes) => updateItem("deductionItems", index, changes)} disabled={!canManage} idPrefix="employee-deduction" />
          </TabPanel>
        </Tabs>
        {!canManage ? <p role="status" className="text-xs text-muted-foreground">บัญชีนี้ดูข้อมูลได้ แต่ไม่มีสิทธิ์แก้ไขรายได้/หัก</p> : null}
      </section>
    </div>
  );
}

function EmployeeActions({ employee, canEdit, canManagePayroll, canOffboard, onView, onEdit, onPayroll, onOffboardEmployee }) {
  const name = `${employee.firstName} ${employee.lastName}`;
  return (
    <div className="flex items-center justify-end gap-1">
      <IconButton icon={RiEyeLine} aria-label={`ดูข้อมูล ${name}`} onClick={() => onView(employee)} />
      {canEdit || canOffboard ? (
        <>
          {canEdit ? <IconButton icon={RiEditLine} aria-label={`แก้ไข ${name}`} onClick={() => onEdit(employee)} /> : null}
          {canManagePayroll ? <IconButton icon={RiMoneyDollarCircleLine} aria-label={`ตั้งค่ารายได้และรายหัก ${name}`} onClick={() => onPayroll(employee)} /> : null}
          {canOffboard && employee.isActive ? <Button type="button" size="xs" variant="outline" className="text-destructive" aria-label={`เปลี่ยน ${name} เป็นพ้นสภาพ`} onClick={() => onOffboardEmployee(employee)}>พ้นสภาพ</Button> : null}
        </>
      ) : null}
    </div>
  );
}

function EmployeeCard({ employee, tenureAsOf, ...props }) {
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
        <div><dt className="text-xs text-muted-foreground">อายุงาน</dt><dd className="mt-1 tabular-nums text-foreground">{formatEmploymentTenure(employee, tenureAsOf)}</dd></div>
      </dl>
      <div className="mt-4 border-t border-border pt-3">
        <EmployeeActions employee={employee} {...props} />
      </div>
    </article>
  );
}

export default function EmployeeModule() {
  const { permissions = [] } = useHrmRole();
  const canCreate = canCreateEmployees(permissions);
  const canUpdateProfile = canUpdateEmployeeProfiles(permissions);
  const canOffboard = canOffboardEmployees(permissions);
  const canManageCompensation = canManageEmployeeCompensation({ permissions });
  const canViewCompensation = canViewEmployeeCompensation(permissions);
  const canEditEmployee = canUpdateProfile || canManageCompensation;
  const canViewDocuments = canViewEmployeeDocuments(permissions);
  const canUploadDocuments = canUploadEmployeeDocuments(permissions);
  const canShareDocuments = canShareEmployeeDocuments(permissions);
  const canDeleteDocuments = canDeleteEmployeeDocuments(permissions);

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
  const [tenureAsOf, setTenureAsOf] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [employeeFormTab, setEmployeeFormTab] = useState("profile");
  const canEditProfileForm = editing ? canUpdateProfile : canCreate;
  const [form, setForm] = useState(blankForm);
  const [otRateDefaults, setOtRateDefaults] = useState({ weekdayMultiplier: "1.5", holidayMultiplier: "3" });
  const [otRateSettingsLoaded, setOtRateSettingsLoaded] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [offboardingEndDate, setOffboardingEndDate] = useState(todayStr());
  const [notice, setNotice] = useState(null);

  const [masterOpen, setMasterOpen] = useState(false);
  const [masterTab, setMasterTab] = useState("employmentTypes");
  const [masterEditorOpen, setMasterEditorOpen] = useState(false);
  const [editingMaster, setEditingMaster] = useState(null);
  const [masterDraft, setMasterDraft] = useState({ name: "", code: "" });
  const [masterDeleteTarget, setMasterDeleteTarget] = useState(null);
  const masterWorkflow = useMasterDataWorkflow();

  const employeeWorkflow = useEmployeeWorkflow({
    onEmployeesChanged: () => {
      setPage(1);
      setRefreshKey((current) => current + 1);
    },
    onEmployeeChanged: (employeeId, item) => {
      setSelected((current) => current?.id === employeeId ? item : current);
    },
    onSuccess: (message) => setNotice({ type: "success", message }),
  });
  const { saving, formError, setFormError, offboarding, offboardError, setOffboardError } = employeeWorkflow;

  useEffect(() => {
    let timeoutId;
    function updateTenureDate() {
      const now = new Date();
      setTenureAsOf(todayStr(now));
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timeoutId = window.setTimeout(updateTenureDate, tomorrow.getTime() - now.getTime() + 1000);
    }
    updateTenureDate();
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/ot-rates")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (cancelled || !payload?.item) return;
        setOtRateDefaults({
          weekdayMultiplier: String(payload.item.weekdayMultiplier ?? 1.5),
          holidayMultiplier: String(payload.item.holidayMultiplier ?? 3),
        });
      })
      .catch(() => null)
      .finally(() => { if (!cancelled) setOtRateSettingsLoaded(true); });
    return () => { cancelled = true; };
  }, []);

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
        const response = await fetch(`/api/employees${canOffboard ? "?includeDeleted=true" : ""}`);
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
  }, [canOffboard, refreshKey]);

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

  function toggleWeeklyHoliday(day) {
    setForm((current) => {
      const selectedDays = Array.isArray(current.weeklyHolidays) ? current.weeklyHolidays : [];
      const weeklyHolidays = selectedDays.includes(day)
        ? selectedDays.filter((value) => value !== day)
        : [...selectedDays, day];
      return { ...current, weeklyHolidays };
    });
  }

  async function openAdd() {
    let defaults = otRateDefaults;
    if (!otRateSettingsLoaded) {
      const payload = await fetch("/api/settings/ot-rates")
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null);
      if (payload?.item) {
        defaults = {
          weekdayMultiplier: String(payload.item.weekdayMultiplier ?? 1.5),
          holidayMultiplier: String(payload.item.holidayMultiplier ?? 3),
        };
        setOtRateDefaults(defaults);
      }
      setOtRateSettingsLoaded(true);
    }
    setEditing(null);
    setEmployeeFormTab("profile");
    setForm({
      ...blankForm,
      payrollData: createDefaultEmployeePayrollData(),
      otWeekdayMultiplier: defaults.weekdayMultiplier,
      otHolidayMultiplier: defaults.holidayMultiplier,
      startDate: todayStr(),
    });
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(employee, initialTab = "profile") {
    setEditing(employee);
    setEmployeeFormTab(initialTab === "payroll" && canViewCompensation ? "payroll" : (canUpdateProfile ? "profile" : "payroll"));
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
      baseSalary: employee.baseSalary == null ? "" : String(employee.baseSalary),
      payrollData: normalizeEmployeePayrollData(employee.payrollData),
      otWeekdayMultiplier: String(employee.otWeekdayMultiplier ?? 1.5),
      otHolidayMultiplier: String(employee.otHolidayMultiplier ?? 3),
      workHoursPerDay: String(employee.workHoursPerDay ?? 8),
      weeklyHolidays: Array.isArray(employee.weeklyHolidays) ? [...employee.weeklyHolidays] : [],
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

  function openPayrollSettings(employee) {
    openEdit(employee, "payroll");
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setFormError("");
  }

  async function saveEmployee(event) {
    event.preventDefault();
    const saved = await employeeWorkflow.saveEmployee({
      employee: editing,
      form,
      lookups,
      canEditProfile: editing ? canUpdateProfile : canCreate,
      canEditCompensation: canManageCompensation,
    });
    if (!saved) return;
    setFormOpen(false);
    setEditing(null);
  }

  function beginOffboard(employee) {
    setDeleteTarget(employee);
    setOffboardingEndDate(todayStr());
    setOffboardError("");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const completed = await employeeWorkflow.offboardEmployee({ employee: deleteTarget, endDate: offboardingEndDate });
    if (!completed) return;
    setDeleteTarget(null);
  }

  function beginMasterEdit(item) {
    setEditingMaster(item);
    setMasterDraft({ name: item.name || "", code: item.code || "" });
    masterWorkflow.clearFeedback();
    setMasterEditorOpen(true);
  }

  function beginMasterCreate() {
    setEditingMaster(null);
    setMasterDraft({ name: "", code: "" });
    masterWorkflow.clearFeedback();
    setMasterEditorOpen(true);
  }

  async function saveMaster(event) {
    event.preventDefault();
    const config = MASTER_ITEMS.find((item) => item.key === masterTab);
    if (!config) return;
    await masterWorkflow.saveMaster({
      config,
      draft: masterDraft,
      editing: editingMaster,
      onSaved: (item) => {
        setLookups((current) => ({
          ...current,
          [masterTab]: [...current[masterTab].filter((entry) => entry.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name, "th")),
        }));
        setMasterEditorOpen(false);
        setEditingMaster(null);
        setMasterDraft({ name: "", code: "" });
        setPage(1);
        setRefreshKey((current) => current + 1);
      },
    });
  }

  async function confirmMasterDelete() {
    if (!masterDeleteTarget) return;
    const config = MASTER_ITEMS.find((item) => item.key === masterTab);
    if (!config) return;
    await masterWorkflow.deleteMaster({
      config,
      item: masterDeleteTarget,
      onDeleted: () => {
        setLookups((current) => ({
          ...current,
          [masterTab]: current[masterTab].filter((entry) => entry.id !== masterDeleteTarget.id),
        }));
        setMasterDeleteTarget(null);
        setMasterEditorOpen(false);
        setEditingMaster(null);
        setSelected(null);
        setLookupRefresh((current) => current + 1);
        setRefreshKey((current) => current + 1);
      },
    });
  }

  const currentMaster = MASTER_ITEMS.find((item) => item.key === masterTab) || MASTER_ITEMS[0];
  const currentMasterItems = lookups[masterTab] || [];
  const activeDepartments = lookups.departments.filter((item) => item.isActive !== false);
  const activePositions = lookups.positions.filter((item) => item.isActive !== false);
  const activeTypes = lookups.employmentTypes.filter((item) => item.isActive !== false);

  return (
    <div className="hrm-page">
      <PageHeader
        eyebrow="ข้อมูลบุคลากร · พนักงาน"
        title="ทะเบียนพนักงาน"
        description="จัดการข้อมูลพนักงาน แผนก ตำแหน่ง และประเภทการจ้างในที่เดียว"
        actions={canCreate ? (
          <>
            <Button type="button" variant="outline" leadingIcon={RiSettings3Line} onClick={() => setMasterOpen(true)}>จัดการรายการ</Button>
            <Button type="button" leadingIcon={RiAddLine} onClick={openAdd}>เพิ่มพนักงาน</Button>
          </>
        ) : null}
      />

      <IntegrationFeatureNotice service="cloudinary" />

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
          ...(canOffboard ? [{ key: "former", label: "พ้นสภาพ", count: formerCount }] : []),
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
          <table className="w-full min-w-[1100px] text-left">
            <thead className="bg-muted/70">
              <tr className="text-xs font-semibold text-muted-foreground">
                <th scope="col" className="px-4 py-3">รหัส</th>
                <th scope="col" className="px-4 py-3">พนักงาน</th>
                <th scope="col" className="px-4 py-3">แผนก / ตำแหน่ง</th>
                <th scope="col" className="px-4 py-3">ประเภทการจ้าง</th>
                <th scope="col" className="px-4 py-3">วันที่เริ่ม / สิ้นสุดงาน</th>
                <th scope="col" className="px-4 py-3">อายุงาน</th>
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
                    <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-foreground">{formatEmploymentTenure(employee, tenureAsOf)}</td>
                    <td className="px-4 py-3"><StatusChip status={employee.employmentStatus?.name} /></td>
                    <td className="px-3 py-3"><EmployeeActions employee={employee} canEdit={canEditEmployee} canManagePayroll={canManageCompensation} canOffboard={canOffboard} onView={setSelected} onEdit={openEdit} onPayroll={openPayrollSettings} onOffboardEmployee={beginOffboard} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {pageItems.map((employee) => <EmployeeCard key={employee.id} employee={employee} tenureAsOf={tenureAsOf} canEdit={canEditEmployee} canManagePayroll={canManageCompensation} canOffboard={canOffboard} onView={setSelected} onEdit={openEdit} onPayroll={openPayrollSettings} onOffboardEmployee={beginOffboard} />)}
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
        description={editing ? `${editing.code} · ${editing.firstName} ${editing.lastName}` : "กำหนดรหัสพนักงานเองเป็นตัวเลข 4 หลัก เช่น 2603"}
        size={canViewDocuments || canViewCompensation ? "lg" : "md"}
        className="border-t-4 border-t-primary"
        footer={<><Button type="button" variant="secondary" onClick={closeForm} disabled={saving || uploadingAvatar}>ยกเลิก</Button><Button type="submit" form="employee-form" disabled={saving || uploadingAvatar}>{saving ? "กำลังบันทึก..." : uploadingAvatar ? "กำลังอัปโหลดรูป..." : "บันทึกข้อมูล"}</Button></>}
      >
        <form id="employee-form" className="min-w-0" onSubmit={saveEmployee} noValidate>
          <Tabs selectedKey={employeeFormTab} onSelectionChange={(key) => setEmployeeFormTab(String(key))}>
            <TabList aria-label="ข้อมูลพนักงาน" className="w-full flex-wrap">
              {canEditProfileForm ? <Tab id="profile">ข้อมูลพนักงาน</Tab> : null}
              {canViewCompensation ? <Tab id="payroll">รายได้/หัก</Tab> : null}
            </TabList>

            {canEditProfileForm ? (
              <TabPanel id="profile" className="mt-4 grid items-start gap-4 sm:grid-cols-2">
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
                <DatePickerField label="วันเกิด" value={form.birthDate} onChange={(value) => updateForm("birthDate", value?.toString() || "")} />
                <div className="min-w-0 space-y-2">
                  <Input label={editing ? "อีเมล" : "อีเมล *"} type="email" value={form.email} onChange={(value) => updateForm("email", value)} isRequired={!editing || Boolean(form.email)} />
                  {!editing ? <p className="text-xs leading-5 text-muted-foreground">ใช้เข้าสู่ระบบได้ด้วยอีเมลหรือรหัสพนักงาน โดยรหัสผ่านเริ่มต้นคือรหัสพนักงานและต้องเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก</p> : null}
                </div>
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
                <DatePickerField label="วันที่เริ่มงาน *" value={form.startDate} onChange={(value) => updateForm("startDate", value?.toString() || "")} isRequired />
                {editing && !editing.isActive ? <DatePickerField label="วันที่สิ้นสุดการทำงาน" value={form.endDate} onChange={(value) => updateForm("endDate", value?.toString() || "")} /> : null}
                <fieldset className="sm:col-span-2 min-w-0">
                  <legend className="text-sm font-medium text-foreground">วันหยุดประจำสัปดาห์</legend>
                  <p id="employee-weekly-holidays-help" className="mt-1 text-xs leading-5 text-muted-foreground">เลือกได้มากกว่าหนึ่งวัน หากยังไม่กำหนดให้เว้นว่าง</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {WEEKLY_DAYS.map((day) => {
                      const isSelected = Array.isArray(form.weeklyHolidays) && form.weeklyHolidays.includes(day.value);
                      const checkboxId = `employee-weekly-holiday-${day.value}`;
                      return (
                        <label key={day.value} htmlFor={checkboxId} className={cn(
                          "flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring",
                          isSelected ? "border-primary bg-primary/5 text-foreground" : "border-border bg-background text-foreground hover:bg-muted",
                        )}>
                          <Checkbox id={checkboxId} isSelected={isSelected} onChange={() => toggleWeeklyHoliday(day.value)} aria-describedby="employee-weekly-holidays-help" />
                          <span>{day.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {canManageCompensation ? (
                  <section className="sm:col-span-2 grid gap-3 border-t border-border pt-4 sm:grid-cols-2" aria-labelledby="employee-ot-settings-title">
                    <div className="sm:col-span-2">
                      <h3 id="employee-ot-settings-title" className="text-sm font-semibold text-foreground">ข้อมูลสำหรับคำนวณ OT</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">ฐานเงินเดือนกำหนดในแท็บรายได้/หัก แล้วระบบนำไปคำนวณค่าแรงรายชั่วโมง</p>
                    </div>
                    <Input label="ชั่วโมงทำงานปกติต่อวัน" type="number" min="0.01" max="24" step="0.25" inputMode="decimal" value={form.workHoursPerDay} onChange={(value) => updateForm("workHoursPerDay", value)} isRequired />
                    <Input label="เรท OT วันธรรมดา (เท่า)" type="number" min="0.01" max="10" step="0.01" inputMode="decimal" value={form.otWeekdayMultiplier} onChange={(value) => updateForm("otWeekdayMultiplier", value)} isRequired />
                    <Input label="เรท OT วันหยุด (เท่า)" type="number" min="0.01" max="10" step="0.01" inputMode="decimal" value={form.otHolidayMultiplier} onChange={(value) => updateForm("otHolidayMultiplier", value)} isRequired />
                  </section>
                ) : null}

                <div className="sm:col-span-2 flex flex-wrap items-end gap-3 border-t border-border pt-4">
                  <Input
                    label="รูปโปรไฟล์"
                    type="file"
                    accept="image/png,image/jpeg"
                    isDisabled={uploadingAvatar}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (!file.type.startsWith("image/")) { setFormError("เลือกรูปไม่สำเร็จ เพราะไฟล์ไม่ใช่รูปภาพ"); return; }
                      if (file.size > 15 * 1024 * 1024) { setFormError("เลือกรูปไม่สำเร็จ เพราะไฟล์มีขนาดเกิน 15 MB"); return; }
                      setUploadingAvatar(true);
                      setFormError("");
                      try {
                        const url = await uploadImage(file, {
                          scope: "avatar",
                          maxBytes: 500 * 1024,
                          maxDimension: 512,
                          outputType: "image/jpeg",
                          quality: 0.85,
                          alwaysResize: true,
                        });
                        updateForm("avatarUrl", url);
                      } catch (error) {
                        setFormError(error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ กรุณาเลือกรูปอื่น");
                      } finally {
                        setUploadingAvatar(false);
                      }
                    }}
                  />
                  {uploadingAvatar ? <p role="status" className="pb-2 text-xs text-muted-foreground">กำลังอัปโหลดรูป…</p> : form.avatarUrl ? <div className="flex items-center gap-3 text-xs text-muted-foreground"><Avatar src={form.avatarUrl} alt="รูปพนักงาน" initials={initialsFor(form)} /><span>อัปโหลดรูปแล้ว</span></div> : <p className="pb-2 text-xs text-muted-foreground">JPG หรือ PNG ขนาดไม่เกิน 15 MB (อัปโหลดไปยัง Cloudinary)</p>}
                </div>
              </TabPanel>
            ) : null}

            {canViewCompensation ? (
              <TabPanel id="payroll" className="mt-4">
                <EmployeePayrollSettings key={editing?.id || "new"} form={form} updateForm={updateForm} canManage={canManageCompensation} />
              </TabPanel>
            ) : null}
          </Tabs>
          {formError ? <p role="alert" className="mt-4 rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-sm text-status-danger">{formError}</p> : null}
        </form>
      </HrmDialog>

      <HrmDialog
        open={Boolean(deleteTarget)}
        onClose={() => { if (!offboarding) { setDeleteTarget(null); setOffboardError(""); } }}
        title="ยืนยันการเปลี่ยนสถานะพนักงาน"
        description="ระบบจะเก็บข้อมูลและประวัติของพนักงานไว้ พร้อมบันทึกวันที่สิ้นสุดการทำงาน"
        size="sm"
        footer={<><Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)} disabled={offboarding}>ยกเลิก</Button><Button type="button" variant="danger" onClick={confirmDelete} disabled={offboarding}>{offboarding ? "กำลังดำเนินการ..." : "ยืนยันพ้นสภาพ"}</Button></>}
      >
        <p className="text-sm text-foreground">เปลี่ยน <strong>{deleteTarget ? `${deleteTarget.firstName} ${deleteTarget.lastName}` : ""}</strong> เป็นพ้นสภาพในวันที่</p>
        <DatePickerField className="mt-3" label="วันที่สิ้นสุดการทำงาน" value={offboardingEndDate} onChange={(value) => { setOffboardingEndDate(value?.toString() || ""); setOffboardError(""); }} isRequired />
        {offboardError ? <p role="alert" className="mt-3 rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-sm text-status-danger">{offboardError}</p> : null}
      </HrmDialog>

      <HrmDialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="ข้อมูลพนักงาน"
        description={selected ? `${selected.code} / ${selected.department?.name || "-"} / ${selected.position?.name || "-"}` : ""}
        size="lg"
        footer={<><Button type="button" variant="secondary" onClick={() => setSelected(null)}>ปิด</Button>{canEditEmployee ? <Button type="button" leadingIcon={RiEditLine} onClick={() => { const employee = selected; setSelected(null); openEdit(employee); }}>แก้ไขข้อมูล</Button> : null}</>}
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
              <div><dt className="text-xs text-muted-foreground">วันหยุดประจำสัปดาห์</dt><dd className="mt-1 text-sm text-foreground">{weeklyHolidayLabel(selected.weeklyHolidays)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">อายุงาน</dt><dd className="mt-1 text-sm tabular-nums text-foreground">{formatEmploymentTenure(selected, tenureAsOf)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">วันที่สิ้นสุดงาน</dt><dd className="mt-1 text-sm text-foreground">{formatThaiDate(selected.endDate)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">วันเกิด</dt><dd className="mt-1 text-sm text-foreground">{formatThaiDate(selected.birthDate)}</dd></div>
              {canViewCompensation ? <div><dt className="text-xs text-muted-foreground">ฐานเงินเดือน</dt><dd className="mt-1 text-sm tabular-nums text-foreground">{selected.baseSalary == null ? "ยังไม่ระบุ" : Number(selected.baseSalary).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " บาท"}</dd></div> : null}
              {canViewCompensation ? <div><dt className="text-xs text-muted-foreground">เรท OT วันธรรมดา / วันหยุด</dt><dd className="mt-1 text-sm tabular-nums text-foreground">{selected.otWeekdayMultiplier}× / {selected.otHolidayMultiplier}×</dd></div> : null}
              {canViewCompensation ? <div><dt className="text-xs text-muted-foreground">ชั่วโมงทำงานปกติต่อวัน</dt><dd className="mt-1 text-sm tabular-nums text-foreground">{selected.workHoursPerDay} ชม.</dd></div> : null}
            </dl>
            {canViewDocuments ? <EmployeeDocumentsPanel employeeId={selected.id} canUpload={canUploadDocuments} canShare={canShareDocuments} canDelete={canDeleteDocuments} /> : null}
          </div>
        ) : null}
      </HrmDialog>

      <HrmDialog
        open={masterOpen}
        onClose={() => { if (!masterWorkflow.saving && !masterWorkflow.deleting) { setMasterOpen(false); setMasterEditorOpen(false); masterWorkflow.clearFeedback(); } }}
        title="จัดการรายการพนักงาน"
        description="เพิ่ม แก้ไข หรือลบประเภทการจ้าง สถานะพนักงาน แผนก และตำแหน่ง"
        size="lg"
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
                onClick={() => { setMasterTab(item.key); setMasterEditorOpen(false); masterWorkflow.clearFeedback(); }}
                className={cn("min-h-10 rounded-md border px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", masterTab === item.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted")}
              >
                {item.label}
              </button>
            ))}
          </div>
          {masterWorkflow.notice ? <div role="status" aria-live="polite" className="rounded-md border border-status-success/30 bg-status-success/5 px-3 py-2 text-sm text-foreground">{masterWorkflow.notice}</div> : null}
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
                  <Button type="submit" size="small" disabled={masterWorkflow.saving}>{masterWorkflow.saving ? "กำลังบันทึก..." : editingMaster ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}</Button>
                  <Button type="button" size="small" variant="secondary" disabled={masterWorkflow.saving} onClick={() => { setMasterEditorOpen(false); masterWorkflow.clearFeedback(); }}>ยกเลิก</Button>
                </div>
                {masterWorkflow.error ? <p role="alert" className="sm:col-span-2 text-sm text-status-danger">{masterWorkflow.error}</p> : null}
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
                    <Button type="button" size="small" variant="danger" leadingIcon={RiDeleteBinLine} onClick={() => { setMasterDeleteTarget(item); masterWorkflow.clearFeedback(); }}>ลบ</Button>
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
        onClose={() => { if (!masterWorkflow.deleting) { setMasterDeleteTarget(null); masterWorkflow.clearFeedback(); } }}
        title={`ยืนยันการลบ${currentMaster.label}`}
        description="ข้อมูลพนักงานเดิมจะยังอยู่ แต่ช่องที่อ้างอิงรายการนี้จะถูกล้างเป็นค่าว่าง"
        size="sm"
        footer={<><Button type="button" variant="secondary" onClick={() => setMasterDeleteTarget(null)} disabled={masterWorkflow.deleting}>ยกเลิก</Button><Button type="button" variant="danger" onClick={confirmMasterDelete} disabled={masterWorkflow.deleting}>{masterWorkflow.deleting ? "กำลังลบ..." : "ยืนยันลบ"}</Button></>}
      >
        <p className="text-sm text-foreground">ต้องการลบ <strong>{masterDeleteTarget?.name}</strong> ใช่หรือไม่</p>
        {masterWorkflow.deleteError ? <p role="alert" className="mt-3 rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-sm text-status-danger">{masterWorkflow.deleteError}</p> : null}
      </HrmDialog>
    </div>
  );
}
