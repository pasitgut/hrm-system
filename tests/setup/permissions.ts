import { MANAGER_PERMISSIONS } from "@/lib/auth/permissions";

// Access is granted by permissions, not by the legacy `role` column. Tests keep
// describing accounts as "employee" / "supervisor" / "ceo" for readability and
// map that to the grants such an account would carry.
export function permissionsForRole(role: string | undefined): string[] {
  return role === "supervisor" || role === "ceo" ? [...MANAGER_PERMISSIONS] : [];
}
