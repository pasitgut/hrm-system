import type { Role } from "@/lib/auth/session";

// Single source of truth for role -> capability checks. supervisor and ceo
// currently share identical OT permissions; kept as functions (not inlined
// role-string comparisons) so a future split is a one-line change.

export function canApproveOT(role: Role): boolean {
  return role === "supervisor" || role === "ceo";
}

export function canViewCompanyOt(role: Role): boolean {
  return role === "supervisor" || role === "ceo";
}

export function canApproveLeave(role: Role): boolean {
  return role === "supervisor" || role === "ceo";
}

export function canApproveAssetLoan(role: Role): boolean {
  return role === "supervisor" || role === "ceo";
}

export function canManageEmployees(role: Role): boolean {
  return role === "supervisor" || role === "ceo";
}

export function canManageAssets(role: Role): boolean {
  return role === "supervisor" || role === "ceo";
}

export function canManageSettings(role: Role): boolean {
  return role === "supervisor" || role === "ceo";
}
