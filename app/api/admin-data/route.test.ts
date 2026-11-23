import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getAdminResourcesRoute } from "@/app/api/admin-data/route";
import { GET as listAdminRowsRoute, POST as createAdminRowRoute } from "@/app/api/admin-data/[table]/route";
import {
  DELETE as deleteAdminRowRoute,
  GET as getDeleteImpactRoute,
  PATCH as updateAdminRowRoute,
} from "@/app/api/admin-data/[table]/[id]/route";
import { SYSTEM_ADMIN_USER_ID } from "@/lib/auth/admin";
import { encodePermissionsForStorage } from "@/lib/auth/permissions";
import { ROLE_DEFAULT_PERMISSIONS } from "@/lib/auth/roles";
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth/session";
import { assetRequestEvents, assetRequests, departments, employees, leaveRequests, lineCalendarEvents, overtimeRequests, users } from "@/lib/db/schema";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createEmployee, createLeaveRequest, createOvertimeRequest, createUser } from "@/tests/setup/factories";

function req(url: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers.cookie = `${COOKIE_NAME}=${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

function adminToken() {
  return createSessionToken({
    sub: SYSTEM_ADMIN_USER_ID,
    employeeId: "",
    email: "admin@peopleos.co",
    role: "hr",
    isSystemAdmin: true,
  });
}

function sessionTokenFor(user: { id: string; employeeId: string; email: string; role: SessionPayload["role"] }) {
  return createSessionToken({
    sub: user.id,
    employeeId: user.employeeId,
    email: user.email,
    role: user.role,
  });
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("/api/admin-data CRUD and cascading hard delete", () => {
  it("restricts access to built-in admin or allowed HR managers and enforces page.admin_data.denied", async () => {
    expect((await getAdminResourcesRoute(req("http://localhost/api/admin-data"))).status).toBe(401);

    const { user: empUser, employee: emp } = await createUser({ role: "employee" });
    const empToken = await sessionTokenFor({ id: empUser.id, employeeId: emp!.id, email: empUser.email, role: "employee" });
    expect((await getAdminResourcesRoute(req("http://localhost/api/admin-data", { token: empToken }))).status).toBe(403);

    const { user: deniedHr, employee: deniedHrEmp } = await createUser({
      role: "hr",
      permissions: encodePermissionsForStorage(ROLE_DEFAULT_PERMISSIONS.hr, ["admin_data"]),
    });
    const deniedHrToken = await sessionTokenFor({ id: deniedHr.id, employeeId: deniedHrEmp!.id, email: deniedHr.email, role: "hr" });
    expect((await getAdminResourcesRoute(req("http://localhost/api/admin-data", { token: deniedHrToken }))).status).toBe(403);

    const token = await adminToken();
    const res = await getAdminResourcesRoute(req("http://localhost/api/admin-data", { token }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tables).toHaveLength(20);
  });

  it("supports create, list, edit, and hard delete on departments", async () => {
    const token = await adminToken();

    const createRes = await createAdminRowRoute(
      req("http://localhost/api/admin-data/departments", {
        method: "POST",
        token,
        body: { name: "Legal & Compliance", isActive: true },
      }),
      { params: Promise.resolve({ table: "departments" }) },
    );
    expect(createRes.status).toBe(201);
    const createdId = String((await createRes.json()).item.id);

    const listRes = await listAdminRowsRoute(
      req("http://localhost/api/admin-data/departments?search=Legal", { token }),
      { params: Promise.resolve({ table: "departments" }) },
    );
    const listBody = await listRes.json();
    expect(listBody.total).toBe(1);
    expect(listBody.rows[0].name).toBe("Legal & Compliance");

    const patchRes = await updateAdminRowRoute(
      req(`http://localhost/api/admin-data/departments/${createdId}`, {
        method: "PATCH",
        token,
        body: { name: "Legal", isActive: false },
      }),
      { params: Promise.resolve({ table: "departments", id: createdId }) },
    );
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).item).toMatchObject({ name: "Legal", isActive: false });

    const delRes = await deleteAdminRowRoute(
      req(`http://localhost/api/admin-data/departments/${createdId}`, { method: "DELETE", token }),
      { params: Promise.resolve({ table: "departments", id: createdId }) },
    );
    expect(delRes.status).toBe(200);
    expect(await db.select().from(departments).where(eq(departments.id, Number(createdId)))).toHaveLength(0);
  });

  it("reports cascade impacts and safely hard-deletes an employee with user, OT, leave, calendar, asset requests/events, and subordinate refs", async () => {
    const token = await adminToken();
    const { user: targetUser, employee: targetEmp } = await createUser({ role: "employee", email: "target.emp@example.com" });
    const subordinate = await createEmployee({ managerId: targetEmp!.id, email: "sub@example.com" });

    await createOvertimeRequest({ employeeId: targetEmp!.id });
    const leaveReq = await createLeaveRequest({ employeeId: targetEmp!.id });
    await db.insert(lineCalendarEvents).values({
      employeeId: targetEmp!.id,
      leaveRequestId: leaveReq.id,
      title: "วันลาสมชาย",
      startOn: "2026-09-15",
      endOn: "2026-09-15",
      status: "confirmed",
    });

    const [assetReq] = await db.insert(assetRequests).values({
      borrowerEmployeeId: targetEmp!.id,
      borrowerEmployeeCode: targetEmp!.code,
      borrowerName: `${targetEmp!.firstName} ${targetEmp!.lastName}`,
      fromDate: "2026-09-15",
      reason: "ยืมกล้อง",
      remarks: "",
    }).returning({ id: assetRequests.id });

    await db.insert(assetRequestEvents).values({
      requestId: assetReq.id,
      actorEmployeeId: targetEmp!.id,
      eventType: "submitted",
      details: {},
    });

    const impactRes = await getDeleteImpactRoute(
      req(`http://localhost/api/admin-data/employees/${targetEmp!.id}`, { token }),
      { params: Promise.resolve({ table: "employees", id: targetEmp!.id }) },
    );
    expect(impactRes.status).toBe(200);
    const impactBody = await impactRes.json();
    expect(impactBody.confirmText).toBe(targetEmp!.code);
    expect(impactBody.impacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "บัญชีผู้ใช้ (users)", count: 1, action: "delete" }),
        expect.objectContaining({ label: "คำขอ OT ของพนักงาน", count: 1, action: "delete" }),
        expect.objectContaining({ label: "คำขอวันลาของพนักงาน", count: 1, action: "delete" }),
        expect.objectContaining({ label: "คำขอยืมทรัพย์สินของพนักงาน", count: 1, action: "delete" }),
        expect.objectContaining({ label: "กิจกรรมปฏิทิน LINE", count: 1, action: "delete" }),
        expect.objectContaining({ label: "ลูกทีมที่อ้างอิงเป็นหัวหน้า (ปลดการผูกหัวหน้า)", count: 1, action: "unlink" }),
      ]),
    );

    const delRes = await deleteAdminRowRoute(
      req(`http://localhost/api/admin-data/employees/${targetEmp!.id}`, { method: "DELETE", token }),
      { params: Promise.resolve({ table: "employees", id: targetEmp!.id }) },
    );
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody).toMatchObject({
      deleted: true,
      id: targetEmp!.id,
      deletedRelated: {
        users: 1,
        overtimeRequests: 1,
        leaveRequests: 1,
        assetRequests: 1,
        lineCalendarEvents: 1,
      },
    });

    expect(await db.select().from(employees).where(eq(employees.id, targetEmp!.id))).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.id, targetUser.id))).toHaveLength(0);
    expect(await db.select().from(overtimeRequests).where(eq(overtimeRequests.employeeId, targetEmp!.id))).toHaveLength(0);
    expect(await db.select().from(leaveRequests).where(eq(leaveRequests.employeeId, targetEmp!.id))).toHaveLength(0);
    expect(await db.select().from(assetRequests).where(eq(assetRequests.id, assetReq.id))).toHaveLength(0);
    expect(await db.select().from(assetRequestEvents).where(eq(assetRequestEvents.requestId, assetReq.id))).toHaveLength(0);

    const [updatedSub] = await db.select().from(employees).where(eq(employees.id, subordinate.id));
    expect(updatedSub.managerId).toBeNull();
  });

  it("never exposes passwordHash in users listing and prevents active HR users from deleting their own account", async () => {
    const { user: hrUser, employee: hrEmp } = await createUser({
      role: "hr",
      permissions: encodePermissionsForStorage(ROLE_DEFAULT_PERMISSIONS.hr),
    });
    const hrToken = await sessionTokenFor({ id: hrUser.id, employeeId: hrEmp!.id, email: hrUser.email, role: "hr" });

    const listRes = await listAdminRowsRoute(
      req("http://localhost/api/admin-data/users", { token: hrToken }),
      { params: Promise.resolve({ table: "users" }) },
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.rows[0].passwordHash).toBeUndefined();

    const selfDelRes = await deleteAdminRowRoute(
      req(`http://localhost/api/admin-data/users/${hrUser.id}`, { method: "DELETE", token: hrToken }),
      { params: Promise.resolve({ table: "users", id: hrUser.id }) },
    );
    expect(selfDelRes.status).toBe(409);
  });
});
