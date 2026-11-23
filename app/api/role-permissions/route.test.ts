import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as importSheetsRoute } from "@/app/api/migration/sheets/route";
import { GET as getRolePermissionsRoute, PATCH as patchRolePermissionsRoute } from "@/app/api/role-permissions/route";
import { PATCH as patchUserPermissionRoute } from "@/app/api/user-permissions/[id]/route";
import { GET as getUserPermissionsRoute } from "@/app/api/user-permissions/route";
import { POST as provisionUsersRoute } from "@/app/api/user-permissions/provision/route";
import { SYSTEM_ADMIN_USER_ID } from "@/lib/auth/admin";
import { extractDeniedPages } from "@/lib/auth/page-access";
import { encodePermissionsForStorage, normalizePermissions } from "@/lib/auth/permissions";
import { ROLE_DEFAULT_PERMISSIONS } from "@/lib/auth/roles";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";
import { ensureCoreLookupData } from "@/lib/db/auto-migrate";
import { rolePermissions, users } from "@/lib/db/schema";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createEmployee, createUser } from "@/tests/setup/factories";

function jsonReq(url: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers.cookie = `${COOKIE_NAME}=${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

function sessionFor(user: { id: string; employeeId: string; email: string; role: SessionPayload["role"] }): SessionPayload {
  return { sub: user.id, employeeId: user.employeeId, email: user.email, role: user.role };
}

async function adminToken() {
  return createSessionToken({
    sub: SYSTEM_ADMIN_USER_ID,
    employeeId: "",
    email: "admin@peopleos.co",
    role: "hr",
    isSystemAdmin: true,
  });
}

beforeEach(async () => {
  await resetDb();
  await ensureCoreLookupData(db);
});

afterAll(async () => {
  await closeDb();
});

describe("/api/role-permissions", () => {
  it("rejects unauthenticated callers and users without users.permissions.manage", async () => {
    expect((await getRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions"))).status).toBe(401);
    expect((await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      body: { rolePermissions: { employee: ["ot.view_self"] } },
    }))).status).toBe(401);

    const { user, employee } = await createUser({
      role: "executive",
      permissions: encodePermissionsForStorage(ROLE_DEFAULT_PERMISSIONS.executive),
    });
    const execToken = await createSessionToken(
      sessionFor({ id: user.id, employeeId: employee!.id, email: user.email, role: "executive" }),
    );

    expect((await getRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", { token: execToken }))).status).toBe(403);
    expect((await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      token: execToken,
      body: { rolePermissions: { employee: ["ot.view_self"] } },
    }))).status).toBe(403);
  });

  it("returns persisted role permissions and active role counts", async () => {
    await createUser({ role: "employee" });
    await createUser({ role: "executive" });
    const token = await adminToken();

    const [roleRes, userRes] = await Promise.all([
      getRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", { token })),
      getUserPermissionsRoute(jsonReq("http://localhost/api/user-permissions", { token })),
    ]);

    expect(roleRes.status).toBe(200);
    const rolePayload = await roleRes.json();
    expect(rolePayload.rolePermissions.employee).toEqual(normalizePermissions([...ROLE_DEFAULT_PERMISSIONS.employee]));
    expect(rolePayload.rolePermissions.hr).toEqual(normalizePermissions([...ROLE_DEFAULT_PERMISSIONS.hr]));
    expect(rolePayload.rolePermissions.executive).toEqual(normalizePermissions([...ROLE_DEFAULT_PERMISSIONS.executive]));
    expect(rolePayload.roleCounts).toEqual({ employee: 1, hr: 0, executive: 1 });

    expect(userRes.status).toBe(200);
    const userPayload = await userRes.json();
    expect(userPayload.rolePermissions).toEqual(rolePayload.rolePermissions);
    expect(userPayload.roleCounts).toEqual({ employee: 1, hr: 0, executive: 1 });
  });

  it("validates payload shapes, role names, permission keys, and syncMode", async () => {
    const token = await adminToken();

    expect((await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      token,
      body: { rolePermissions: {} },
    }))).status).toBe(400);

    expect((await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      token,
      body: { rolePermissions: { supervisor: ["ot.view_self"] } },
    }))).status).toBe(400);

    expect((await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      token,
      body: { rolePermissions: { employee: ["nonexistent.permission"] } },
    }))).status).toBe(400);

    expect((await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      token,
      body: { rolePermissions: { employee: ["ot.view_self"] }, syncMode: "invalid" },
    }))).status).toBe(400);
  });

  it("supports matching, all, and none sync modes and applies updated defaults to newly provisioned accounts", async () => {
    const token = await adminToken();

    // User A follows standard employee defaults; User B has custom OT company view permission.
    const { user: standardEmp } = await createUser({
      role: "employee",
      permissions: encodePermissionsForStorage(ROLE_DEFAULT_PERMISSIONS.employee),
    });
    const customEmployeePerms = [...ROLE_DEFAULT_PERMISSIONS.employee, "ot.view_company"] as const;
    const { user: customEmp } = await createUser({
      role: "employee",
      permissions: encodePermissionsForStorage(customEmployeePerms),
    });

    // 1. syncMode = "matching": updates DB role template & standardEmp (disabling ot.request.self), keeps customEmp untouched
    const nextEmployeePerms = ROLE_DEFAULT_PERMISSIONS.employee.filter((key) => key !== "ot.request.self");
    const matchingRes = await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      token,
      body: {
        rolePermissions: { employee: nextEmployeePerms },
        syncMode: "matching",
      },
    }));

    expect(matchingRes.status).toBe(200);
    const matchingBody = await matchingRes.json();
    expect(matchingBody.syncedUserCount).toBe(1);
    expect(matchingBody.syncedByRole).toEqual({ employee: 1, hr: 0, executive: 0 });
    expect(matchingBody.rolePermissions.employee).not.toContain("ot.request.self");

    const [standardAfterMatching] = await db.select().from(users).where(eq(users.id, standardEmp.id));
    const [customAfterMatching] = await db.select().from(users).where(eq(users.id, customEmp.id));
    expect(normalizePermissions(standardAfterMatching.permissions)).not.toContain("ot.request.self");
    expect(normalizePermissions(customAfterMatching.permissions)).toContain("ot.view_company");
    expect(normalizePermissions(customAfterMatching.permissions)).toContain("ot.request.self");

    // 2. Provision a brand-new active employee without a login: inherits persisted DB employee role permissions
    const newEmp = await createEmployee({ code: "9101", email: "new.role.test@example.com" });
    const provisionRes = await provisionUsersRoute(jsonReq("http://localhost/api/user-permissions/provision", {
      method: "POST",
      token,
    }));
    expect(provisionRes.status).toBe(200);
    const [provisionedUser] = await db.select().from(users).where(eq(users.employeeId, newEmp.id));
    expect(normalizePermissions(provisionedUser.permissions)).not.toContain("ot.request.self");

    // 3. syncMode = "all": updates all employee accounts including customEmp
    const allRes = await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      token,
      body: {
        rolePermissions: { employee: ROLE_DEFAULT_PERMISSIONS.employee },
        syncMode: "all",
      },
    }));
    expect(allRes.status).toBe(200);
    const allBody = await allRes.json();
    expect(allBody.syncedUserCount).toBe(3);

    const [customAfterAll] = await db.select().from(users).where(eq(users.id, customEmp.id));
    expect(normalizePermissions(customAfterAll.permissions)).not.toContain("ot.view_company");
    expect(normalizePermissions(customAfterAll.permissions)).toContain("ot.request.self");

    // 4. syncMode = "none": updates role_permissions table only without modifying user rows
    const noneRes = await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      token,
      body: {
        rolePermissions: { executive: ["ot.view_company", "ot.view_self"] },
        syncMode: "none",
      },
    }));
    expect(noneRes.status).toBe(200);
    const noneBody = await noneRes.json();
    expect(noneBody.syncedUserCount).toBe(0);
    const [execRow] = await db.select().from(rolePermissions).where(eq(rolePermissions.role, "executive"));
    expect(normalizePermissions(execRow.permissions)).not.toContain("ot.approve");
  });

  it("refuses with 409 when syncing the hr role would remove users.permissions.manage from the last active DB manager", async () => {
    const token = await adminToken();
    await createUser({
      role: "hr",
      permissions: encodePermissionsForStorage(ROLE_DEFAULT_PERMISSIONS.hr),
    });

    const hrWithoutManager = ROLE_DEFAULT_PERMISSIONS.hr.filter((key) => key !== "users.permissions.manage");
    const response = await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      token,
      body: {
        rolePermissions: { hr: hrWithoutManager },
        syncMode: "all",
      },
    }));

    expect(response.status).toBe(409);
  });

  it("persists roleDeniedPages and per-user deniedPages, syncs matching accounts, and blocks denied pages such as /settings/import", async () => {
    const token = await adminToken();
    const { user: standardHr, employee: hrEmp } = await createUser({
      role: "hr",
      permissions: encodePermissionsForStorage(ROLE_DEFAULT_PERMISSIONS.hr),
    });
    const { user: customHr } = await createUser({
      role: "hr",
      permissions: encodePermissionsForStorage(ROLE_DEFAULT_PERMISSIONS.hr, ["payroll"]),
    });

    // Save page denials on the HR role with syncMode = "matching"
    const rolePatch = await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      token,
      body: {
        roleDeniedPages: { hr: ["import", "reports"] },
        syncMode: "matching",
      },
    }));
    expect(rolePatch.status).toBe(200);
    const rolePatchBody = await rolePatch.json();
    expect(rolePatchBody.roleDeniedPages.hr).toEqual(["reports", "import"]);
    expect(rolePatchBody.syncedUserCount).toBe(1);

    // Reject unknown page keys with 400
    const badPageRes = await patchRolePermissionsRoute(jsonReq("http://localhost/api/role-permissions", {
      method: "PATCH",
      token,
      body: {
        roleDeniedPages: { hr: ["unknown_page"] },
      },
    }));
    expect(badPageRes.status).toBe(400);

    // Matching user inherits page.import.denied; custom user keeps their own deniedPages=["payroll"]
    const [standardAfter] = await db.select().from(users).where(eq(users.id, standardHr.id));
    const [customAfter] = await db.select().from(users).where(eq(users.id, customHr.id));
    expect(extractDeniedPages(standardAfter.permissions)).toEqual(["reports", "import"]);
    expect(extractDeniedPages(customAfter.permissions)).toEqual(["payroll"]);

    // Denied import page blocks POST /api/migration/sheets even though users.permissions.manage is still granted
    const standardHrToken = await createSessionToken(
      sessionFor({ id: standardHr.id, employeeId: hrEmp!.id, email: standardHr.email, role: "hr" }),
    );
    const importBlockedRes = await importSheetsRoute(
      jsonReq("http://localhost/api/migration/sheets", { method: "POST", token: standardHrToken }),
    );
    expect(importBlockedRes.status).toBe(403);

    // Per-user PATCH can override deniedPages individually (re-enable import, keep reports denied)
    const userPatchRes = await patchUserPermissionRoute(
      jsonReq(`http://localhost/api/user-permissions/${standardHr.id}`, {
        method: "PATCH",
        token,
        body: {
          role: "hr",
          permissions: ROLE_DEFAULT_PERMISSIONS.hr,
          deniedPages: ["reports"],
        },
      }),
      { params: Promise.resolve({ id: standardHr.id }) },
    );
    expect(userPatchRes.status).toBe(200);
    const userPatchBody = await userPatchRes.json();
    expect(userPatchBody.item.deniedPages).toEqual(["reports"]);

    // GET /api/user-permissions exposes roleDeniedPages + per-user deniedPages
    const userListRes = await getUserPermissionsRoute(jsonReq("http://localhost/api/user-permissions", { token }));
    const userListBody = await userListRes.json();
    expect(userListBody.roleDeniedPages.hr).toEqual(["reports", "import"]);
    const updatedRow = userListBody.items.find((item: { id: string }) => item.id === standardHr.id);
    expect(updatedRow.deniedPages).toEqual(["reports"]);
  });
});
