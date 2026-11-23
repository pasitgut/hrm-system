import { asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { extractDeniedPages } from "@/lib/auth/page-access";
import { normalizePermissions } from "@/lib/auth/permissions";
import { getMissingUserAccountsSummary } from "@/lib/auth/provision-users";
import { getRoleAccessState, type RoleCountsMap } from "@/lib/auth/role-permissions";
import { normalizeRole } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { employees, users } from "@/lib/db/schema";

export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiPermission(request, "users.permissions.manage");
  const [items, missingAccounts, roleAccess] = await Promise.all([
    db
      .select({
        id: users.id,
        employeeId: employees.id,
        employeeCode: employees.code,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: users.email,
        role: users.role,
        permissions: users.permissions,
        isActive: users.isActive,
      })
      .from(users)
      .innerJoin(employees, eq(users.employeeId, employees.id))
      .where(eq(users.isActive, true))
      .orderBy(asc(employees.firstName), asc(employees.lastName)),
    getMissingUserAccountsSummary(),
    getRoleAccessState(),
  ]);

  const roleCounts: RoleCountsMap = { employee: 0, hr: 0, executive: 0 };
  const normalizedItems = items.map((item) => {
    const role = normalizeRole(item.role);
    roleCounts[role] += 1;
    return {
      ...item,
      role,
      permissions: normalizePermissions(item.permissions),
      deniedPages: extractDeniedPages(item.permissions),
    };
  });

  return NextResponse.json({
    items: normalizedItems,
    missingAccounts,
    rolePermissions: roleAccess.rolePermissions,
    roleDeniedPages: roleAccess.roleDeniedPages,
    roleCounts,
  });
});
