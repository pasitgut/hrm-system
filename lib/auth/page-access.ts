import {
  canApproveAnything,
  canManageAssetTemplates,
  canManageLeaveQuotas,
  canManageUserPermissions,
  canOpenSettings,
  canViewCompanyAssetRequests,
  canViewCompanyLeave,
  canViewCompanyOt,
  canViewEmployeeDocuments,
  canViewEmployeeProfiles,
  canViewOwnAssetRequests,
  canViewOwnLeaveRequests,
  canViewOwnOtRequests,
  canViewReports,
  canViewWorkTracking,
  encodePermissionsForStorage,
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
} from "@/lib/auth/permissions";

export const PAGE_ACCESS_KEYS = [
  "employees",
  "documents",
  "work",
  "ot",
  "leave",
  "assets",
  "approvals",
  "payroll",
  "reports",
  "settings",
  "import",
  "admin_data",
] as const;

export type PageAccessKey = (typeof PAGE_ACCESS_KEYS)[number];

export type PageAccessDefinition = {
  key: PageAccessKey;
  href: string;
  label: string;
  group: "การทำงาน" | "ข้อมูลและรายงาน" | "ระบบ";
  description: string;
  minimumPermissions: readonly PermissionKey[];
  minimumPermissionsLabel: string;
  hasBasePermission: (permissions: unknown) => boolean;
};

export const PAGE_ACCESS_ITEMS: readonly PageAccessDefinition[] = [
  {
    key: "employees",
    href: "/employees",
    label: "พนักงาน",
    group: "การทำงาน",
    description: "ดูและจัดการทะเบียนประวัติพนักงาน",
    minimumPermissions: ["employees.profile.view"],
    minimumPermissionsLabel: "ดูรายชื่อพนักงาน",
    hasBasePermission: canViewEmployeeProfiles,
  },
  {
    key: "documents",
    href: "/documents",
    label: "เอกสาร",
    group: "การทำงาน",
    description: "ดู อัปโหลด และแชร์เอกสารพนักงาน",
    minimumPermissions: ["employees.documents.view"],
    minimumPermissionsLabel: "ดูเอกสารที่ได้รับสิทธิ์",
    hasBasePermission: canViewEmployeeDocuments,
  },
  {
    key: "work",
    href: "/work-tracking",
    label: "ติดตามงาน",
    group: "การทำงาน",
    description: "ติดตามสถานะงานตรวจบ้านและงานย่อย",
    minimumPermissions: ["work.view"],
    minimumPermissionsLabel: "ดูภาพรวมติดตามงาน",
    hasBasePermission: canViewWorkTracking,
  },
  {
    key: "ot",
    href: "/ot",
    label: "เวลาล่วงเวลา (OT)",
    group: "การทำงาน",
    description: "ยื่นคำขอ ปฏิทิน และสรุปชั่วโมง/ค่า OT",
    minimumPermissions: ["ot.view_self"],
    minimumPermissionsLabel: "ดู OT ของตัวเอง",
    hasBasePermission: (permissions) => canViewOwnOtRequests(permissions) || canViewCompanyOt(permissions),
  },
  {
    key: "leave",
    href: "/leave",
    label: "วันลา",
    group: "การทำงาน",
    description: "ยื่นคำขอลา ดูสิทธิ์วันลา และประวัติการลา",
    minimumPermissions: ["leave.view_self"],
    minimumPermissionsLabel: "ดูวันลาของตัวเอง",
    hasBasePermission: (permissions) =>
      canViewOwnLeaveRequests(permissions) || canViewCompanyLeave(permissions) || canManageLeaveQuotas(permissions),
  },
  {
    key: "assets",
    href: "/assets",
    label: "ทรัพย์สิน",
    group: "การทำงาน",
    description: "คำขอยืม-คืนทรัพย์สิน และสัญญาประกอบ",
    minimumPermissions: ["assets.view_self"],
    minimumPermissionsLabel: "ดูคำขอทรัพย์สินของตัวเอง",
    hasBasePermission: (permissions) =>
      canViewOwnAssetRequests(permissions) || canViewCompanyAssetRequests(permissions) || canManageAssetTemplates(permissions),
  },
  {
    key: "approvals",
    href: "/approvals",
    label: "รออนุมัติ",
    group: "การทำงาน",
    description: "ศูนย์พิจารณาอนุมัติคำขอ OT วันลา และทรัพย์สิน",
    minimumPermissions: ["ot.approve"],
    minimumPermissionsLabel: "อนุมัติ OT",
    hasBasePermission: canApproveAnything,
  },
  {
    key: "payroll",
    href: "/payroll",
    label: "เงินเดือน",
    group: "ข้อมูลและรายงาน",
    description: "คำนวณและส่งออกสลิปเงินเดือน",
    minimumPermissions: ["salary_slips.view", "employees.compensation.view"],
    minimumPermissionsLabel: "ดูสลิปเงินเดือน + ค่าตอบแทน",
    hasBasePermission: (permissions) =>
      hasPermission(permissions, "salary_slips.view") && hasPermission(permissions, "employees.compensation.view"),
  },
  {
    key: "reports",
    href: "/reports",
    label: "รายงาน",
    group: "ข้อมูลและรายงาน",
    description: "ดูและส่งออกรายงานสรุปของระบบ",
    minimumPermissions: ["reports.view"],
    minimumPermissionsLabel: "ดูและส่งออกรายงาน",
    hasBasePermission: canViewReports,
  },
  {
    key: "settings",
    href: "/settings",
    label: "ตั้งค่าระบบ",
    group: "ระบบ",
    description: "จัดการแผนก ตำแหน่ง ประเภทการจ้าง เรท OT และประเภทการลา",
    minimumPermissions: ["settings.departments.manage"],
    minimumPermissionsLabel: "จัดการแผนก",
    hasBasePermission: canOpenSettings,
  },
  {
    key: "import",
    href: "/settings/import",
    label: "นำเข้าข้อมูล",
    group: "ระบบ",
    description: "นำเข้าข้อมูลจากไฟล์ Google Sheet / Excel",
    minimumPermissions: ["users.permissions.manage"],
    minimumPermissionsLabel: "จัดการสิทธิ์ผู้ใช้",
    hasBasePermission: canManageUserPermissions,
  },
  {
    key: "admin_data",
    href: "/settings/admin-data",
    label: "จัดการฐานข้อมูล",
    group: "ระบบ",
    description: "ดู เพิ่ม แก้ไข และลบข้อมูลถาวรในฐานข้อมูลสำหรับผู้ดูแลระบบ",
    minimumPermissions: ["users.permissions.manage"],
    minimumPermissionsLabel: "จัดการสิทธิ์ผู้ใช้",
    hasBasePermission: canManageUserPermissions,
  },
];

const PAGE_ACCESS_KEY_SET = new Set<string>(PAGE_ACCESS_KEYS);
const PAGE_ACCESS_BY_KEY = new Map<PageAccessKey, PageAccessDefinition>(
  PAGE_ACCESS_ITEMS.map((item) => [item.key, item]),
);
const KNOWN_PERMISSION_SET = new Set<string>(PERMISSIONS.map(({ key }) => key));

export function pageDeniedMarker(pageKey: PageAccessKey): string {
  return `page.${pageKey}.denied`;
}

export function isPageAccessKey(value: unknown): value is PageAccessKey {
  return typeof value === "string" && PAGE_ACCESS_KEY_SET.has(value);
}

export function extractDeniedPages(rawPermissions: unknown): PageAccessKey[] {
  if (!Array.isArray(rawPermissions)) return [];
  const rawSet = new Set(rawPermissions.filter((entry): entry is string => typeof entry === "string"));
  return PAGE_ACCESS_KEYS.filter((pageKey) => rawSet.has(pageDeniedMarker(pageKey)));
}

export function normalizeDeniedPages(value: unknown): PageAccessKey[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set<PageAccessKey>();
  for (const entry of value) {
    if (isPageAccessKey(entry)) valid.add(entry);
  }
  return PAGE_ACCESS_KEYS.filter((pageKey) => valid.has(pageKey));
}

export function haveSameDeniedPages(a: unknown, b: unknown): boolean {
  const listA = normalizeDeniedPages(a);
  const listB = normalizeDeniedPages(b);
  if (listA.length !== listB.length) return false;
  return listA.every((key, index) => key === listB[index]);
}

export function isPageDenied(rawPermissions: unknown, pageKey: PageAccessKey): boolean {
  if (!Array.isArray(rawPermissions)) return false;
  return rawPermissions.includes(pageDeniedMarker(pageKey));
}

export function canAccessPage(rawPermissions: unknown, pageKey: PageAccessKey): boolean {
  if (!Array.isArray(rawPermissions)) return false;
  if (isPageDenied(rawPermissions, pageKey)) return false;
  const item = PAGE_ACCESS_BY_KEY.get(pageKey);
  if (!item) return false;
  return item.hasBasePermission(rawPermissions);
}

export function isPageEnabledForDraft(
  permissions: readonly PermissionKey[],
  deniedPages: readonly PageAccessKey[],
  pageKey: PageAccessKey,
): boolean {
  return canAccessPage(encodePermissionsForStorage(permissions, deniedPages), pageKey);
}

export function applyPageAccessToggle(
  permissions: readonly PermissionKey[],
  deniedPages: readonly PageAccessKey[],
  pageKey: PageAccessKey,
  enabled: boolean,
): { permissions: PermissionKey[]; deniedPages: PageAccessKey[] } {
  const currentPermissions = PERMISSIONS.map(({ key }) => key).filter((key) =>
    permissions.includes(key) && KNOWN_PERMISSION_SET.has(key),
  );
  const currentDenied = normalizeDeniedPages(deniedPages);

  if (!enabled) {
    const nextDenied = normalizeDeniedPages([...currentDenied, pageKey]);
    return {
      permissions: currentPermissions,
      deniedPages: nextDenied,
    };
  }

  const nextDenied = currentDenied.filter((key) => key !== pageKey);
  const item = PAGE_ACCESS_BY_KEY.get(pageKey);
  let nextPermissions = currentPermissions;
  if (item && !item.hasBasePermission(encodePermissionsForStorage(nextPermissions, nextDenied))) {
    const merged = new Set<PermissionKey>([...nextPermissions, ...item.minimumPermissions]);
    nextPermissions = PERMISSIONS.map(({ key }) => key).filter((key) => merged.has(key));
  }

  return {
    permissions: nextPermissions,
    deniedPages: nextDenied,
  };
}
