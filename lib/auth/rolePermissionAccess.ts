type AccessContext = {
  role?: unknown;
  permissions?: unknown;
};

const LEGACY_MANAGER_ROLES = ["supervisor", "ceo"];

function hasAccess(context: AccessContext, ...permissionKeys: string[]): boolean {
  if (Array.isArray(context.permissions)) {
    return permissionKeys.some((key) => context.permissions.includes(key));
  }

  return typeof context.role === "string" && LEGACY_MANAGER_ROLES.includes(context.role);
}

export function canManageEmployeeCompensation(context: AccessContext): boolean {
  return hasAccess(context, "employees.manage");
}

export function canManageOtRates(context: AccessContext): boolean {
  return hasAccess(context, "settings.manage");
}

export function canViewCompanyOtData(context: AccessContext): boolean {
  return hasAccess(context, "ot.view_company", "ot.approve");
}

export function canApproveOtData(context: AccessContext): boolean {
  return hasAccess(context, "ot.approve");
}
