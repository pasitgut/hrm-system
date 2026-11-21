import { createHash, timingSafeEqual } from "node:crypto";
import { encodePermissionsForStorage, PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";

export const SYSTEM_ADMIN_USER_ID = "system-admin";
export const SYSTEM_ADMIN_DISPLAY_NAME = "ผู้ดูแลระบบ";
export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_EMAIL = "admin@peopleos.co";
export const DEFAULT_ADMIN_PASSWORD = "admin";

const SELF_SERVICE_PERMISSION_KEYS = new Set<PermissionKey>([
  "ot.view_self",
  "ot.request.self",
  "leave.view_self",
  "leave.request.self",
  "assets.view_self",
  "assets.request.self",
]);

export type AdminConfig = {
  username: string;
  email: string;
  password: string;
  isDefaultPassword: boolean;
};

export function getAdminConfig(): AdminConfig {
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase() || DEFAULT_ADMIN_USERNAME;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL;
  const envPassword = process.env.ADMIN_PASSWORD;
  const hasCustomPassword = typeof envPassword === "string" && envPassword.length > 0;

  return {
    username,
    email,
    password: hasCustomPassword ? envPassword : DEFAULT_ADMIN_PASSWORD,
    isDefaultPassword: !hasCustomPassword,
  };
}

export function isSystemAdminIdentifier(identifier: string): boolean {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) return false;
  const config = getAdminConfig();
  return (
    normalized === config.username
    || normalized === config.email
    || normalized === DEFAULT_ADMIN_USERNAME
  );
}

export function verifySystemAdminCredentials(identifier: string, password: string): boolean {
  if (!isSystemAdminIdentifier(identifier) || !password) return false;
  const expected = getAdminConfig().password;
  const actualDigest = createHash("sha256").update(password, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function isSystemAdminUserId(userId: string | null | undefined): boolean {
  return userId === SYSTEM_ADMIN_USER_ID;
}

export function isSystemAdminSession(
  user: { sub?: string | null; isSystemAdmin?: boolean } | null | undefined,
): boolean {
  return Boolean(user && (user.isSystemAdmin === true || user.sub === SYSTEM_ADMIN_USER_ID));
}

export function getSystemAdminPermissions(): string[] {
  const granted = PERMISSIONS
    .map(({ key }) => key)
    .filter((key) => !SELF_SERVICE_PERMISSION_KEYS.has(key));
  return encodePermissionsForStorage(granted);
}
