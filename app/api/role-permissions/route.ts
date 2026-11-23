import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { isPageAccessKey, normalizeDeniedPages, type PageAccessKey } from "@/lib/auth/page-access";
import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";
import {
  getActiveRoleCounts,
  getRoleAccessState,
  updateRolePermissionsMap,
  type RoleSyncMode,
} from "@/lib/auth/role-permissions";
import { isRole, type Role } from "@/lib/auth/roles";

const KNOWN_PERMISSION_KEYS = new Set<string>(PERMISSIONS.map(({ key }) => key));
const VALID_SYNC_MODES = new Set<RoleSyncMode>(["matching", "all", "none"]);

export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiPermission(request, "users.permissions.manage");
  const [{ rolePermissions, roleDeniedPages }, roleCounts] = await Promise.all([
    getRoleAccessState(),
    getActiveRoleCounts(),
  ]);
  return NextResponse.json({ rolePermissions, roleDeniedPages, roleCounts });
});

export const PATCH = withApiAuth(async (request: NextRequest) => {
  await requireApiPermission(request, "users.permissions.manage");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Invalid request body");
  }

  const payload = body as Record<string, unknown>;
  const hasPermsField = Object.prototype.hasOwnProperty.call(payload, "rolePermissions");
  const hasDeniedField = Object.prototype.hasOwnProperty.call(payload, "roleDeniedPages");

  if (!hasPermsField && !hasDeniedField) {
    return jsonError(400, "rolePermissions or roleDeniedPages is required");
  }

  const rolePermissionUpdates: Partial<Record<Role, readonly PermissionKey[]>> = {};
  if (hasPermsField) {
    const rawRoleMap = payload.rolePermissions;
    if (!rawRoleMap || typeof rawRoleMap !== "object" || Array.isArray(rawRoleMap)) {
      return jsonError(400, "rolePermissions must be an object");
    }
    for (const [roleKey, permsValue] of Object.entries(rawRoleMap as Record<string, unknown>)) {
      if (!isRole(roleKey)) {
        return jsonError(400, `Unsupported role: ${roleKey}`);
      }
      if (
        !Array.isArray(permsValue)
        || permsValue.some((perm) => typeof perm !== "string" || !KNOWN_PERMISSION_KEYS.has(perm))
      ) {
        return jsonError(400, `permissions for ${roleKey} contains an unknown permission`);
      }
      rolePermissionUpdates[roleKey] = [...new Set(permsValue)] as PermissionKey[];
    }
  }

  const roleDeniedUpdates: Partial<Record<Role, readonly PageAccessKey[]>> = {};
  if (hasDeniedField) {
    const rawDeniedMap = payload.roleDeniedPages;
    if (!rawDeniedMap || typeof rawDeniedMap !== "object" || Array.isArray(rawDeniedMap)) {
      return jsonError(400, "roleDeniedPages must be an object");
    }
    for (const [roleKey, pagesValue] of Object.entries(rawDeniedMap as Record<string, unknown>)) {
      if (!isRole(roleKey)) {
        return jsonError(400, `Unsupported role: ${roleKey}`);
      }
      if (!Array.isArray(pagesValue) || pagesValue.some((page) => !isPageAccessKey(page))) {
        return jsonError(400, `roleDeniedPages for ${roleKey} contains an unknown page key`);
      }
      roleDeniedUpdates[roleKey] = normalizeDeniedPages(pagesValue);
    }
  }

  if (Object.keys(rolePermissionUpdates).length === 0 && Object.keys(roleDeniedUpdates).length === 0) {
    return jsonError(400, "At least one role update must be provided");
  }

  let syncMode: RoleSyncMode = "matching";
  if (payload.syncMode !== undefined) {
    if (typeof payload.syncMode !== "string" || !VALID_SYNC_MODES.has(payload.syncMode as RoleSyncMode)) {
      return jsonError(400, "syncMode must be matching, all, or none");
    }
    syncMode = payload.syncMode as RoleSyncMode;
  }

  const result = await updateRolePermissionsMap(
    {
      rolePermissions: rolePermissionUpdates,
      roleDeniedPages: roleDeniedUpdates,
    },
    syncMode,
  );
  if (!result.ok) {
    return jsonError(
      409,
      "ต้องมีบัญชีผู้ใช้ที่ใช้งานอยู่อย่างน้อย 1 บัญชีที่ยังมีสิทธิ์จัดการสิทธิ์ผู้ใช้",
    );
  }

  return NextResponse.json({
    rolePermissions: result.rolePermissions,
    roleDeniedPages: result.roleDeniedPages,
    syncedUserCount: result.syncedUserCount,
    syncedByRole: result.syncedByRole,
  });
});
