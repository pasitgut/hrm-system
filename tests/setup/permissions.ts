import { MANAGER_PERMISSIONS } from "@/lib/auth/permissions";

// Access is granted by permissions, not by the `role` column alone. Tests keep
// describing accounts as "employee" / "hr" / "executive" for readability and
// map that to the grants such an account would carry.
export function permissionsForRole(role: string | undefined): string[] {
  return role === "hr" || role === "executive" ? [...MANAGER_PERMISSIONS] : [];
}
