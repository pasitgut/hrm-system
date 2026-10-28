export const PERMISSIONS = [
  { key: "work.view", group: "ติดตามงาน", label: "ดูภาพรวมติดตามงาน", description: "ดูรายการงาน สถานะ และกำหนดส่ง" },
  { key: "work.status.update", group: "ติดตามงาน", label: "ปรับสถานะงานย่อย", description: "เปลี่ยนสถานะการดำเนินงานของแต่ละงานย่อย" },
  { key: "work.create", group: "ติดตามงาน", label: "สร้างรายการติดตามงาน", description: "เพิ่มรายการใหม่ในระบบติดตามงาน" },
  { key: "salary_slips.view", group: "สลิปเงินเดือน", label: "ดูสลิปเงินเดือน", description: "ดูสลิปและประวัติการแก้ไขของพนักงานทุกคน" },
  { key: "salary_slips.import", group: "สลิปเงินเดือน", label: "นำเข้าสลิปเงินเดือน", description: "นำเข้า Excel จับคู่พนักงาน และบันทึกสลิป" },
  { key: "salary_slips.replace", group: "สลิปเงินเดือน", label: "แทนที่สลิปเงินเดือน", description: "ยืนยันแทนที่ยอดเดิมโดยเก็บประวัติรุ่น" },
  { key: "salary_slips.export", group: "สลิปเงินเดือน", label: "ส่งออกสลิปเงินเดือน", description: "ดาวน์โหลด PDF และ Excel" },
  { key: "employees.profile.view", group: "พนักงาน", label: "ดูรายชื่อและประวัติพนักงาน", description: "เปิดดูข้อมูลทั่วไปของพนักงาน โดยข้อมูลค่าตอบแทนแยกสิทธิ์ต่างหาก" },
  { key: "employees.profile.create", group: "พนักงาน", label: "เพิ่มพนักงาน", description: "สร้างประวัติพนักงานและบัญชีเข้าใช้งาน" },
  { key: "employees.profile.update", group: "พนักงาน", label: "แก้ไขข้อมูลพนักงาน", description: "แก้ไขประวัติและข้อมูลการทำงาน โดยไม่รวมข้อมูลค่าตอบแทน" },
  { key: "employees.profile.offboard", group: "พนักงาน", label: "เปลี่ยนสถานะพ้นสภาพ", description: "บันทึกวันสิ้นสุดงานและปิดบัญชีพนักงาน" },
  { key: "employees.compensation.view", group: "พนักงาน", label: "ดูข้อมูลค่าตอบแทน", description: "ดูเงินเดือน เรท OT และชั่วโมงทำงานที่ใช้คำนวณ OT" },
  { key: "employees.compensation.manage", group: "พนักงาน", label: "แก้ไขข้อมูลค่าตอบแทน", description: "กำหนดเงินเดือน เรท OT รายบุคคล และชั่วโมงทำงานปกติ" },
  { key: "employees.documents.view", group: "เอกสารพนักงาน", label: "ดูเอกสารที่ได้รับสิทธิ์", description: "ดูและดาวน์โหลดเอกสารที่มีการแชร์ให้บัญชีนี้" },
  { key: "employees.documents.view_all", group: "เอกสารพนักงาน", label: "ดูเอกสารทั้งหมด", description: "ดูและดาวน์โหลดเอกสารของพนักงานทุกคน" },
  { key: "employees.documents.upload", group: "เอกสารพนักงาน", label: "อัปโหลดเอกสาร", description: "เพิ่มเอกสารในประวัติของพนักงาน" },
  { key: "employees.documents.share", group: "เอกสารพนักงาน", label: "กำหนดผู้มีสิทธิ์รายเอกสาร", description: "เลือกบัญชีที่ดูและดาวน์โหลดเอกสารแต่ละรายการได้" },
  { key: "employees.documents.delete", group: "เอกสารพนักงาน", label: "ลบเอกสาร", description: "ลบเอกสารออกจาก Google Drive และประวัติพนักงาน" },
  { key: "ot.view_self", group: "OT", label: "ดู OT ของตัวเอง", description: "ดูรายการ OT และสรุปชั่วโมงของบัญชีนี้" },
  { key: "ot.request.self", group: "OT", label: "จัดการคำขอ OT ของตัวเอง", description: "ยื่น แก้ไข และยกเลิกคำขอ OT ของบัญชีนี้" },
  { key: "ot.approve", group: "OT", label: "อนุมัติ OT", description: "ตรวจสอบและอนุมัติหรือปฏิเสธคำขอ OT" },
  { key: "ot.view_company", group: "OT", label: "ดู OT ทั้งบริษัท", description: "ดูรายการและสรุป OT ของพนักงานทุกคน" },
  { key: "leave.view_self", group: "วันลา", label: "ดูวันลาของตัวเอง", description: "ดูคำขอและยอดสิทธิ์วันลาของบัญชีนี้" },
  { key: "leave.request.self", group: "วันลา", label: "จัดการคำขอลาของตัวเอง", description: "ยื่น แก้ไข และยกเลิกคำขอลาของบัญชีนี้" },
  { key: "leave.approve", group: "วันลา", label: "อนุมัติวันลา", description: "ตรวจสอบและอนุมัติหรือปฏิเสธคำขอลา" },
  { key: "leave.view_company", group: "วันลา", label: "ดูวันลาทั้งบริษัท", description: "ดูคำขอและสรุปวันลาของพนักงานทุกคน" },
  { key: "leave_types.manage", group: "วันลา", label: "จัดการประเภทการลา", description: "เพิ่ม แก้ไข และปิดใช้งานประเภทการลา" },
  { key: "leave.quotas.manage", group: "วันลา", label: "จัดการโควตาวันลา", description: "กำหนดโควตาวันลาและยอดคงเหลือของพนักงาน" },
  { key: "assets.view_self", group: "ทรัพย์สิน", label: "ดูคำขอของตัวเอง", description: "ดูคำขอยืมและสถานะทรัพย์สินของบัญชีนี้" },
  { key: "assets.request.self", group: "ทรัพย์สิน", label: "สร้างคำขอยืมของตัวเอง", description: "ส่งคำขอยืมทรัพย์สินในนามบัญชีนี้" },
  { key: "assets.view_company", group: "ทรัพย์สิน", label: "ดูคำขอทรัพย์สินทั้งบริษัท", description: "ดูรายการยืมและคืนทรัพย์สินของพนักงานทุกคน" },
  { key: "assets.requests.manage", group: "ทรัพย์สิน", label: "อนุมัติและจัดการคำขอ", description: "อนุมัติคำขอ จัดการสัญญา และดำเนินการคืนทรัพย์สิน" },
  { key: "assets.templates.manage", group: "ทรัพย์สิน", label: "จัดการแบบฟอร์มและสัญญา", description: "แก้ไขแม่แบบข้อตกลงและเอกสารประกอบการยืมทรัพย์สิน" },
  { key: "settings.departments.manage", group: "ตั้งค่าระบบ", label: "จัดการแผนก", description: "เพิ่ม แก้ไข และลบรายการแผนก" },
  { key: "settings.positions.manage", group: "ตั้งค่าระบบ", label: "จัดการตำแหน่ง", description: "เพิ่ม แก้ไข และลบรายการตำแหน่งงาน" },
  { key: "settings.employment.manage", group: "ตั้งค่าระบบ", label: "จัดการสถานะและประเภทการจ้าง", description: "แก้ไขข้อมูลหลักที่ใช้ในประวัติพนักงาน" },
  { key: "settings.ot_rates.manage", group: "ตั้งค่าระบบ", label: "ตั้งค่าเรท OT กลาง", description: "กำหนดตัวคูณ OT วันธรรมดาและวันหยุดที่ใช้เป็นค่าเริ่มต้น" },
  { key: "users.permissions.manage", group: "ตั้งค่าระบบ", label: "จัดการสิทธิ์ผู้ใช้", description: "กำหนดสิทธิ์การใช้งานแยกตามบัญชีผู้ใช้" },
  { key: "reports.view", group: "รายงาน", label: "ดูและส่งออกรายงาน", description: "เปิดดูรายงานและส่งออกข้อมูลสรุปของระบบ" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

// Expand older, broad grants when reading existing accounts. Permission edits
// are saved using the more specific keys above, so old accounts keep access
// until an administrator chooses to narrow their grants.
const LEGACY_PERMISSION_EXPANSIONS: Record<string, readonly PermissionKey[]> = {
  "employees.manage": [
    "employees.profile.view",
    "employees.profile.create",
    "employees.profile.update",
    "employees.profile.offboard",
    "employees.compensation.view",
    "employees.compensation.manage",
  ],
  "employees.documents.manage": [
    "employees.documents.view_all",
    "employees.documents.upload",
    "employees.documents.share",
    "employees.documents.delete",
  ],
  "settings.manage": [
    "settings.departments.manage",
    "settings.positions.manage",
    "settings.employment.manage",
    "settings.ot_rates.manage",
    "leave.quotas.manage",
  ],
  "assets.manage": ["assets.requests.manage", "assets.templates.manage"],
};

// Preserve current read and self-service access for existing accounts until
// an administrator explicitly disables a grant in the permissions screen.
const DEFAULT_GRANTS = [
  { permission: "work.view", disabledMarker: "permissions.work_view.disabled" },
  { permission: "work.status.update", disabledMarker: "permissions.work_status_update.disabled" },
  { permission: "employees.profile.view", disabledMarker: "permissions.employees_profile_view.disabled" },
  { permission: "ot.view_self", disabledMarker: "permissions.ot_view_self.disabled" },
  { permission: "leave.view_self", disabledMarker: "permissions.leave_view_self.disabled" },
  { permission: "assets.view_self", disabledMarker: "permissions.assets_view_self.disabled" },
  { permission: "reports.view", disabledMarker: "permissions.reports_view.disabled" },
  { permission: "ot.request.self", disabledMarker: "permissions.ot_request_self.disabled" },
  { permission: "leave.request.self", disabledMarker: "permissions.leave_request_self.disabled" },
  { permission: "assets.request.self", disabledMarker: "permissions.assets_request_self.disabled" },
] as const satisfies readonly { permission: PermissionKey; disabledMarker: string }[];

export function normalizePermissions(permissions: unknown): PermissionKey[] {
  if (!Array.isArray(permissions)) return [];
  const granted = new Set<string>();
  for (const permission of permissions) {
    if (typeof permission !== "string") continue;
    granted.add(permission);
    for (const expanded of LEGACY_PERMISSION_EXPANSIONS[permission] ?? []) granted.add(expanded);
  }
  for (const { permission, disabledMarker } of DEFAULT_GRANTS) {
    if (granted.has(permission) || !permissions.includes(disabledMarker)) granted.add(permission);
  }
  return PERMISSIONS.map(({ key }) => key).filter((key) => granted.has(key));
}

export function encodePermissionsForStorage(permissions: readonly PermissionKey[]): string[] {
  const encoded: string[] = [...new Set(permissions)];
  for (const { permission, disabledMarker } of DEFAULT_GRANTS) {
    if (!encoded.includes(permission)) encoded.push(disabledMarker);
  }
  return encoded;
}

export function hasPermission(permissions: unknown, permission: PermissionKey): boolean {
  if (!Array.isArray(permissions)) return false;
  if (permissions.includes(permission)) return true;
  const legacyGrant = permissions.some((assigned) =>
    typeof assigned === "string" && LEGACY_PERMISSION_EXPANSIONS[assigned]?.includes(permission),
  );
  if (legacyGrant) return true;
  const defaultGrant = DEFAULT_GRANTS.find((item) => item.permission === permission);
  return Boolean(defaultGrant && !permissions.includes(defaultGrant.disabledMarker));
}

export function hasAnyPermission(permissions: unknown, ...keys: PermissionKey[]): boolean {
  return keys.some((key) => hasPermission(permissions, key));
}

export function canApproveOT(permissions: unknown): boolean {
  return hasPermission(permissions, "ot.approve");
}

export function canManageOwnOtRequests(permissions: unknown): boolean {
  return hasPermission(permissions, "ot.request.self");
}

export function canViewOwnOtRequests(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "ot.view_self", "ot.request.self");
}

export function canViewCompanyOt(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "ot.view_company", "ot.approve");
}

export function canApproveLeave(permissions: unknown): boolean {
  return hasPermission(permissions, "leave.approve");
}

export function canManageOwnLeaveRequests(permissions: unknown): boolean {
  return hasPermission(permissions, "leave.request.self");
}

export function canViewOwnLeaveRequests(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "leave.view_self", "leave.request.self");
}

export function canViewCompanyLeave(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "leave.view_company", "leave.approve");
}

export function canApproveAssetLoan(permissions: unknown): boolean {
  return hasManageAssetRequests(permissions);
}

export function canManageEmployees(permissions: unknown): boolean {
  return hasAnyPermission(
    permissions,
    "employees.profile.create",
    "employees.profile.update",
    "employees.profile.offboard",
    "employees.compensation.manage",
  );
}

export function canViewEmployeeProfiles(permissions: unknown): boolean {
  return hasAnyPermission(
    permissions,
    "employees.profile.view",
    "employees.profile.create",
    "employees.profile.update",
    "employees.profile.offboard",
    "employees.compensation.view",
    "employees.compensation.manage",
  );
}

export function canCreateEmployees(permissions: unknown): boolean {
  return hasPermission(permissions, "employees.profile.create");
}

export function canUpdateEmployeeProfiles(permissions: unknown): boolean {
  return hasPermission(permissions, "employees.profile.update");
}

export function canOffboardEmployees(permissions: unknown): boolean {
  return hasPermission(permissions, "employees.profile.offboard");
}

export function canViewEmployeeCompensation(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "employees.compensation.view", "employees.compensation.manage");
}

export function canViewEmployeeDocuments(permissions: unknown): boolean {
  return hasAnyPermission(
    permissions,
    "employees.documents.view",
    "employees.documents.view_all",
    "employees.documents.upload",
    "employees.documents.share",
    "employees.documents.delete",
  );
}

export function canAccessEmployeeDocuments(permissions: unknown): boolean {
  return hasAnyPermission(
    permissions,
    "employees.documents.view",
    "employees.documents.view_all",
    "employees.documents.upload",
    "employees.documents.share",
    "employees.documents.delete",
  );
}

export function canViewAllEmployeeDocuments(permissions: unknown): boolean {
  return hasAnyPermission(
    permissions,
    "employees.documents.view_all",
    "employees.documents.share",
    "employees.documents.delete",
  );
}

export function canUploadEmployeeDocuments(permissions: unknown): boolean {
  return hasPermission(permissions, "employees.documents.upload");
}

export function canShareEmployeeDocuments(permissions: unknown): boolean {
  return hasPermission(permissions, "employees.documents.share");
}

export function canDeleteEmployeeDocuments(permissions: unknown): boolean {
  return hasPermission(permissions, "employees.documents.delete");
}

// Kept as a convenience for employee profile views, where the document panel
// shows management actions only when the user can share or delete documents.
export function canManageEmployeeDocuments(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "employees.documents.share", "employees.documents.delete");
}

export function canManageAssets(permissions: unknown): boolean {
  return hasManageAssetRequests(permissions);
}

export function canViewCompanyAssetRequests(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "assets.view_company", "assets.requests.manage");
}

export function canCreateOwnAssetRequests(permissions: unknown): boolean {
  return hasPermission(permissions, "assets.request.self");
}

export function canViewOwnAssetRequests(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "assets.view_self", "assets.request.self");
}

export function hasManageAssetRequests(permissions: unknown): boolean {
  return hasPermission(permissions, "assets.requests.manage");
}

export function canManageAssetTemplates(permissions: unknown): boolean {
  return hasPermission(permissions, "assets.templates.manage");
}

export function canManageSettings(permissions: unknown): boolean {
  return hasAnyPermission(
    permissions,
    "settings.departments.manage",
    "settings.positions.manage",
    "settings.employment.manage",
    "settings.ot_rates.manage",
    "leave.quotas.manage",
  );
}

export function canManageDepartments(permissions: unknown): boolean {
  return hasPermission(permissions, "settings.departments.manage");
}

export function canManagePositions(permissions: unknown): boolean {
  return hasPermission(permissions, "settings.positions.manage");
}

export function canManageEmploymentSettings(permissions: unknown): boolean {
  return hasPermission(permissions, "settings.employment.manage");
}

export function canManageOtRatesPermission(permissions: unknown): boolean {
  return hasPermission(permissions, "settings.ot_rates.manage");
}

export function canManageLeaveTypes(permissions: unknown): boolean {
  return hasPermission(permissions, "leave_types.manage");
}

export function canManageLeaveQuotas(permissions: unknown): boolean {
  return hasPermission(permissions, "leave.quotas.manage");
}

export function canManageUserPermissions(permissions: unknown): boolean {
  return hasPermission(permissions, "users.permissions.manage");
}

export function canViewReports(permissions: unknown): boolean {
  return hasPermission(permissions, "reports.view");
}

export function canViewWorkTracking(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "work.view", "work.status.update", "work.create");
}

export function canOpenSettings(permissions: unknown): boolean {
  return hasAnyPermission(
    permissions,
    "settings.departments.manage",
    "settings.positions.manage",
    "settings.employment.manage",
    "settings.ot_rates.manage",
    "leave_types.manage",
    "users.permissions.manage",
  );
}

export function canApproveAnything(permissions: unknown): boolean {
  return hasAnyPermission(permissions, "ot.approve", "leave.approve", "assets.requests.manage");
}
