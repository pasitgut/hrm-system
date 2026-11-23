import { eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { db } from "@/lib/db/client";
import type * as schema from "@/lib/db/schema";
import { employees, rolePermissions, users } from "@/lib/db/schema";
import {
  extractDeniedPages,
  haveSameDeniedPages,
  normalizeDeniedPages,
  type PageAccessKey,
} from "@/lib/auth/page-access";
import {
  encodePermissionsForStorage,
  hasPermission,
  haveSamePermissionSet,
  normalizePermissions,
  PERMISSIONS,
  type PermissionKey,
} from "@/lib/auth/permissions";
import {
  normalizeRole,
  ROLE_DEFAULT_PERMISSIONS,
  USER_ROLES,
  type Role,
} from "@/lib/auth/roles";

type ReadableDb = Pick<PostgresJsDatabase<typeof schema>, "select">;

export type RolePermissionsMap = Record<Role, PermissionKey[]>;
export type RoleDeniedPagesMap = Record<Role, PageAccessKey[]>;
export type RoleCountsMap = Record<Role, number>;
export type RoleSyncMode = "matching" | "all" | "none";

const KNOWN_PERMISSION_KEYS = new Set<string>(PERMISSIONS.map(({ key }) => key));

export function sanitizePermissionList(value: readonly string[]): PermissionKey[] {
  const unique = new Set<PermissionKey>();
  for (const entry of value) {
    if (KNOWN_PERMISSION_KEYS.has(entry)) {
      unique.add(entry as PermissionKey);
    }
  }
  return PERMISSIONS.map(({ key }) => key).filter((key) => unique.has(key));
}

export function arePermissionsEqual(a: readonly string[], b: readonly string[]): boolean {
  return haveSamePermissionSet(normalizePermissions(a), normalizePermissions(b));
}

export function buildDefaultRolePermissionsMap(): RolePermissionsMap {
  return {
    employee: normalizePermissions([...ROLE_DEFAULT_PERMISSIONS.employee]),
    hr: normalizePermissions([...ROLE_DEFAULT_PERMISSIONS.hr]),
    executive: normalizePermissions([...ROLE_DEFAULT_PERMISSIONS.executive]),
  };
}

export function buildEmptyRoleDeniedPagesMap(): RoleDeniedPagesMap {
  return {
    employee: [],
    hr: [],
    executive: [],
  };
}

export async function getRoleAccessState(database: ReadableDb = db): Promise<{
  rolePermissions: RolePermissionsMap;
  roleDeniedPages: RoleDeniedPagesMap;
}> {
  const rows = await database
    .select({ role: rolePermissions.role, permissions: rolePermissions.permissions })
    .from(rolePermissions);

  const permsMap = buildDefaultRolePermissionsMap();
  const deniedMap = buildEmptyRoleDeniedPagesMap();

  for (const row of rows) {
    const role = normalizeRole(row.role);
    permsMap[role] = normalizePermissions(row.permissions);
    deniedMap[role] = extractDeniedPages(row.permissions);
  }

  return {
    rolePermissions: permsMap,
    roleDeniedPages: deniedMap,
  };
}

export async function getRolePermissionsMap(database: ReadableDb = db): Promise<RolePermissionsMap> {
  return (await getRoleAccessState(database)).rolePermissions;
}

export async function getStoredPermissionsForRole(
  role: Role,
  database: ReadableDb = db,
): Promise<string[]> {
  const [row] = await database
    .select({ permissions: rolePermissions.permissions })
    .from(rolePermissions)
    .where(eq(rolePermissions.role, role))
    .limit(1);

  if (row && Array.isArray(row.permissions)) {
    return row.permissions;
  }
  return encodePermissionsForStorage(ROLE_DEFAULT_PERMISSIONS[role]);
}

export async function getActiveRoleCounts(database: ReadableDb = db): Promise<RoleCountsMap> {
  const rows = await database
    .select({ role: users.role })
    .from(users)
    .innerJoin(employees, eq(users.employeeId, employees.id))
    .where(eq(users.isActive, true));

  const counts: RoleCountsMap = { employee: 0, hr: 0, executive: 0 };
  for (const row of rows) {
    counts[normalizeRole(row.role)] += 1;
  }
  return counts;
}

export type RoleAccessUpdates = {
  rolePermissions?: Partial<Record<Role, readonly PermissionKey[]>>;
  roleDeniedPages?: Partial<Record<Role, readonly PageAccessKey[]>>;
};

export type UpdateRolePermissionsResult =
  | {
      ok: true;
      rolePermissions: RolePermissionsMap;
      roleDeniedPages: RoleDeniedPagesMap;
      syncedUserCount: number;
      syncedByRole: RoleCountsMap;
    }
  | {
      ok: false;
      kind: "last-manager";
    };

export async function updateRolePermissionsMap(
  updates: RoleAccessUpdates,
  syncMode: RoleSyncMode = "matching",
): Promise<UpdateRolePermissionsResult> {
  const permsUpdates = updates.rolePermissions ?? {};
  const deniedUpdates = updates.roleDeniedPages ?? {};
  const targetRoles = USER_ROLES.filter(
    (role) =>
      Object.prototype.hasOwnProperty.call(permsUpdates, role)
      || Object.prototype.hasOwnProperty.call(deniedUpdates, role),
  );

  return db.transaction(async (tx) => {
    // Share advisory lock key with individual user-permissions updates so concurrent
    // writes cannot strip permission management access from all active accounts.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(74821931)`);

    const [roleRows, activeAccounts] = await Promise.all([
      tx.select({ role: rolePermissions.role, permissions: rolePermissions.permissions }).from(rolePermissions),
      tx.select({ id: users.id, role: users.role, permissions: users.permissions }).from(users).where(eq(users.isActive, true)),
    ]);

    const previousPermsMap = buildDefaultRolePermissionsMap();
    const previousDeniedMap = buildEmptyRoleDeniedPagesMap();
    for (const row of roleRows) {
      const role = normalizeRole(row.role);
      previousPermsMap[role] = normalizePermissions(row.permissions);
      previousDeniedMap[role] = extractDeniedPages(row.permissions);
    }

    const encodedNextByRole = new Map<Role, string[]>();
    const nextPermsMap: RolePermissionsMap = {
      employee: [...previousPermsMap.employee],
      hr: [...previousPermsMap.hr],
      executive: [...previousPermsMap.executive],
    };
    const nextDeniedMap: RoleDeniedPagesMap = {
      employee: [...previousDeniedMap.employee],
      hr: [...previousDeniedMap.hr],
      executive: [...previousDeniedMap.executive],
    };

    for (const role of targetRoles) {
      const nextPerms = Object.prototype.hasOwnProperty.call(permsUpdates, role)
        ? sanitizePermissionList(permsUpdates[role] ?? [])
        : previousPermsMap[role];
      const nextDenied = Object.prototype.hasOwnProperty.call(deniedUpdates, role)
        ? normalizeDeniedPages(deniedUpdates[role] ?? [])
        : previousDeniedMap[role];
      const encoded = encodePermissionsForStorage(nextPerms, nextDenied);
      encodedNextByRole.set(role, encoded);
      nextPermsMap[role] = normalizePermissions(encoded);
      nextDeniedMap[role] = extractDeniedPages(encoded);
    }

    const syncUserIdsByRole = new Map<Role, string[]>();
    const userNextEncodedById = new Map<string, string[]>();

    for (const role of targetRoles) {
      const encodedNext = encodedNextByRole.get(role)!;
      const roleAccounts = activeAccounts.filter((account) => normalizeRole(account.role) === role);
      let targetIds: string[] = [];
      if (syncMode === "all") {
        targetIds = roleAccounts.map((account) => account.id);
      } else if (syncMode === "matching") {
        const previousRolePerms = previousPermsMap[role];
        const previousRoleDenied = previousDeniedMap[role];
        targetIds = roleAccounts
          .filter(
            (account) =>
              arePermissionsEqual(account.permissions, previousRolePerms)
              && haveSameDeniedPages(extractDeniedPages(account.permissions), previousRoleDenied),
          )
          .map((account) => account.id);
      }
      if (targetIds.length > 0) {
        syncUserIdsByRole.set(role, targetIds);
        for (const id of targetIds) {
          userNextEncodedById.set(id, encodedNext);
        }
      }
    }

    const hadManagerBefore = activeAccounts.some((account) =>
      hasPermission(account.permissions, "users.permissions.manage"),
    );
    const hasManagerAfter = activeAccounts.some((account) => {
      const nextPerms = userNextEncodedById.get(account.id) ?? account.permissions;
      return hasPermission(nextPerms, "users.permissions.manage");
    });

    if (hadManagerBefore && !hasManagerAfter) {
      return { ok: false, kind: "last-manager" };
    }

    const now = new Date();
    for (const role of targetRoles) {
      const encoded = encodedNextByRole.get(role)!;
      await tx
        .insert(rolePermissions)
        .values({
          role,
          permissions: encoded,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: rolePermissions.role,
          set: {
            permissions: encoded,
            updatedAt: now,
          },
        });
    }

    const syncedByRole: RoleCountsMap = { employee: 0, hr: 0, executive: 0 };
    let syncedUserCount = 0;

    for (const [role, ids] of syncUserIdsByRole.entries()) {
      const encoded = encodedNextByRole.get(role)!;
      await tx
        .update(users)
        .set({ permissions: encoded, updatedAt: now })
        .where(inArray(users.id, ids));
      syncedByRole[role] = ids.length;
      syncedUserCount += ids.length;
    }

    return {
      ok: true,
      rolePermissions: nextPermsMap,
      roleDeniedPages: nextDeniedMap,
      syncedUserCount,
      syncedByRole,
    };
  });
}
