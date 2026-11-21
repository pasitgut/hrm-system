import { MANAGER_PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";

export const USER_ROLES = ["employee", "hr", "executive"] as const;

export type Role = (typeof USER_ROLES)[number];

export const ROLE_META: Record<Role, { label: string; shortLabel: string; portal: string; description: string }> = {
  employee: {
    label: "พนักงาน",
    shortLabel: "พนักงาน",
    portal: "Employee Self Service (ESS)",
    description: "ดูและจัดการข้อมูล คำขอวันลา OT ทรัพย์สิน และงานของตนเอง",
  },
  hr: {
    label: "ฝ่ายทรัพยากรบุคคล (HR)",
    shortLabel: "HR",
    portal: "HR Portal",
    description: "จัดการพนักงาน เอกสาร เงินเดือน อนุมัติคำขอ รายงาน และตั้งค่าระบบ",
  },
  executive: {
    label: "ผู้บริหาร",
    shortLabel: "ผู้บริหาร",
    portal: "Executive Dashboard",
    description: "ดูภาพรวมองค์กร รายงานสรุป ข้อมูลบริษัท และพิจารณาอนุมัติคำขอ",
  },
};

export const EMPLOYEE_DEFAULT_PERMISSIONS: readonly PermissionKey[] = [
  "work.view",
  "work.status.update",
  "employees.profile.view",
  "ot.view_self",
  "ot.request.self",
  "leave.view_self",
  "leave.request.self",
  "assets.view_self",
  "assets.request.self",
  "reports.view",
];

export const HR_DEFAULT_PERMISSIONS: readonly PermissionKey[] = [
  ...new Set<PermissionKey>([
    ...EMPLOYEE_DEFAULT_PERMISSIONS,
    ...MANAGER_PERMISSIONS,
    "salary_slips.view",
    "salary_slips.export",
    "employees.documents.view",
    "employees.documents.view_all",
    "employees.documents.upload",
    "employees.documents.share",
    "employees.documents.delete",
  ]),
];

export const EXECUTIVE_DEFAULT_PERMISSIONS: readonly PermissionKey[] = [
  ...new Set<PermissionKey>([
    ...EMPLOYEE_DEFAULT_PERMISSIONS,
    "employees.compensation.view",
    "employees.documents.view_all",
    "salary_slips.view",
    "ot.view_company",
    "ot.approve",
    "leave.view_company",
    "leave.approve",
    "assets.view_company",
    "assets.requests.manage",
  ]),
];

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, readonly PermissionKey[]> = {
  employee: EMPLOYEE_DEFAULT_PERMISSIONS,
  hr: HR_DEFAULT_PERMISSIONS,
  executive: EXECUTIVE_DEFAULT_PERMISSIONS,
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

export function normalizeRole(value: unknown): Role {
  return isRole(value) ? value : "employee";
}

export function getRoleLabel(role: unknown): string {
  return ROLE_META[normalizeRole(role)].label;
}

export function getRoleShortLabel(role: unknown): string {
  return ROLE_META[normalizeRole(role)].shortLabel;
}
