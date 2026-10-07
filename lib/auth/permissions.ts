export const PERMISSIONS = [
  { key: "employees.manage", group: "พนักงาน", label: "จัดการพนักงาน", description: "เพิ่ม แก้ไข และจัดการข้อมูลพนักงาน" },
  { key: "employees.documents.view", group: "พนักงาน", label: "ดูเอกสารพนักงาน", description: "ดูและดาวน์โหลดเอกสารประจำตัวพนักงาน" },
  { key: "employees.documents.manage", group: "พนักงาน", label: "จัดการเอกสารพนักงาน", description: "ดู อัปโหลด กำหนดผู้มีสิทธิ์ และลบเอกสารประจำตัวพนักงาน" },
  { key: "ot.approve", group: "OT", label: "อนุมัติ OT", description: "ตรวจสอบและอนุมัติคำขอ OT" },
  { key: "ot.view_company", group: "OT", label: "ดู OT ของทุกคน", description: "ดูตารางและสรุป OT ระดับบริษัท" },
  { key: "leave.approve", group: "วันลา", label: "อนุมัติวันลา", description: "ตรวจสอบและอนุมัติคำขอลา" },
  { key: "leave.view_company", group: "วันลา", label: "ดูวันลาของทุกคน", description: "ดูคำขอและสรุปวันลาระดับบริษัท" },
  { key: "leave_types.manage", group: "วันลา", label: "จัดการประเภทการลา", description: "เพิ่ม แก้ไข และปิดใช้ประเภทการลา" },
  { key: "assets.manage", group: "ทรัพย์สิน", label: "จัดการทรัพย์สิน", description: "ดูและจัดการคำขอยืม รวมถึง Agreement" },
  { key: "settings.manage", group: "ระบบ", label: "จัดการตั้งค่าระบบ", description: "จัดการแผนก ตำแหน่ง และข้อมูลหลักอื่น ๆ" },
  { key: "users.permissions.manage", group: "ระบบ", label: "จัดการสิทธิ์ผู้ใช้", description: "กำหนดสิทธิ์การใช้งานให้บัญชีผู้ใช้" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export function hasPermission(permissions: unknown, permission: PermissionKey): boolean {
  return Array.isArray(permissions) && permissions.includes(permission);
}

export function hasAnyPermission(permissions: unknown, ...keys: PermissionKey[]): boolean {
  return keys.some((key) => hasPermission(permissions, key));
}

export function canApproveOT(permissions: unknown): boolean {
  return hasPermission(permissions, "ot.approve");
}

export function canViewCompanyOt(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "ot.view_company", "ot.approve");
}

export function canApproveLeave(permissions: unknown): boolean {
  return hasPermission(permissions, "leave.approve");
}

export function canViewCompanyLeave(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "leave.view_company", "leave.approve");
}

export function canApproveAssetLoan(permissions: unknown): boolean {
  return hasPermission(permissions, "assets.manage");
}

export function canManageEmployees(permissions: unknown): boolean {
  return hasPermission(permissions, "employees.manage");
}

export function canViewEmployeeDocuments(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "employees.documents.view", "employees.documents.manage");
}

export function canManageEmployeeDocuments(permissions: unknown): boolean {
  return hasPermission(permissions, "employees.documents.manage");
}

export function canManageAssets(permissions: unknown): boolean {
  return hasPermission(permissions, "assets.manage");
}

export function canManageSettings(permissions: unknown): boolean {
  return hasPermission(permissions, "settings.manage");
}

export function canManageLeaveTypes(permissions: unknown): boolean {
  return hasPermission(permissions, "leave_types.manage");
}

export function canManageUserPermissions(permissions: unknown): boolean {
  return hasPermission(permissions, "users.permissions.manage");
}

export function canOpenSettings(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "settings.manage", "leave_types.manage", "users.permissions.manage");
}

export function canApproveAnything(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "ot.approve", "leave.approve", "assets.manage");
}
