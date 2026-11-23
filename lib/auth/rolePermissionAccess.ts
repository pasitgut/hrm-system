import { hasAnyPermission, type PermissionKey } from "@/lib/auth/permissions";

type AccessContext = {
  role?: unknown;
  permissions?: unknown;
};

const PRIVILEGED_ROLES = ["hr", "executive"];

function hasAccess(context: AccessContext, ...permissionKeys: PermissionKey[]): boolean {
  if (Array.isArray(context.permissions)) {
    return hasAnyPermission(context.permissions, ...permissionKeys);
  }

  return typeof context.role === "string" && PRIVILEGED_ROLES.includes(context.role);
}

export function canManageEmployeeCompensation(context: AccessContext): boolean {
  return hasAccess(context, "employees.compensation.manage");
}

export function canViewEmployeeCompensation(context: AccessContext): boolean {
  return hasAccess(context, "employees.compensation.view", "employees.compensation.manage");
}

export function canManageOtRates(context: AccessContext): boolean {
  return hasAccess(context, "settings.ot_rates.manage");
}

export function canManageSocialSecurity(context: AccessContext): boolean {
  return hasAccess(context, "settings.ot_rates.manage", "employees.compensation.manage", "salary_slips.export");
}

export function canViewCompanyOtData(context: AccessContext): boolean {
  return hasAccess(context, "ot.view_company", "ot.approve");
}

export function canApproveOtData(context: AccessContext): boolean {
  return hasAccess(context, "ot.approve");
}
