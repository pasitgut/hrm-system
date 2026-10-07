import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees, leaveRequests, leaveTypes, requestStatuses } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canManageOwnLeaveRequests, canViewCompanyLeave, canViewOwnLeaveRequests } from "@/lib/auth/permissions";
import {
  fetchLeaveItemById,
  jsonError,
  leaveDaySpan,
  leaveQuotaExceededMessage,
  leaveSelectColumns,
  parseLeaveInput,
  toLeaveItemDto,
} from "@/app/api/leave/_shared";

const STATUS_VALUES = new Set(["all", "pending", "approved", "rejected"]);

// Leave isn't calendar-scoped like OT (no `month` param), so the dashboard
// needs the complete set for its calendar and year-to-date summaries.

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canViewOwnLeaveRequests(user.permissions) && !canViewCompanyLeave(user.permissions)) {
    return jsonError(403, "Leave view permission required");
  }
  const searchParams = request.nextUrl.searchParams;

  const statusParam = searchParams.get("status") ?? "all";
  if (!STATUS_VALUES.has(statusParam)) {
    return jsonError(400, "Invalid status");
  }

  const employeeIdParam = searchParams.get("employeeId");

  let scopedEmployeeId: string | undefined;
  if (!canViewCompanyLeave(user.permissions)) {
    if (employeeIdParam && employeeIdParam !== user.employeeId) {
      return jsonError(403, "Forbidden");
    }
    scopedEmployeeId = user.employeeId;
  } else {
    scopedEmployeeId = employeeIdParam ?? undefined;
  }

  const conditions = [];
  if (statusParam !== "all") conditions.push(eq(leaveRequests.statusCode, statusParam));
  if (scopedEmployeeId) conditions.push(eq(leaveRequests.employeeId, scopedEmployeeId));

  const rows = await db
    .select(leaveSelectColumns)
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeCode, leaveTypes.code))
    .innerJoin(requestStatuses, eq(leaveRequests.statusCode, requestStatuses.code))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(leaveRequests.createdAt));

  return NextResponse.json({ items: rows.map(toLeaveItemDto) });
});

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canManageOwnLeaveRequests(user.permissions)) return jsonError(403, "Leave self-service permission required");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (typeof body !== "object" || body === null) {
    return jsonError(400, "Invalid request body");
  }

  const { employeeId } = body as Record<string, unknown>;
  if (employeeId != null && employeeId !== user.employeeId) {
    return jsonError(400, "Cannot create a leave request for another employee");
  }

  const parsed = parseLeaveInput(body as Record<string, unknown>);
  // Explicit `=== false` (not `!parsed.ok`) — this TypeScript 7 preview
  // compiler doesn't narrow a discriminated union through `!` negation.
  if (parsed.ok === false) {
    return jsonError(400, parsed.message);
  }

  const startYear = parsed.value.startOn.slice(0, 4);
  const startOfYear = `${startYear}-01-01`;
  const endOfYear = `${startYear}-12-31`;
  const requestedDays = leaveDaySpan(parsed.value.startOn, parsed.value.endOn, parsed.value.session);

  const result = await db.transaction(async (tx) => {
    // Serialize quota checks for one employee so concurrent submissions
    // cannot both spend the same remaining balance.
    const [employee] = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, user.employeeId))
      .for("update");
    if (!employee) {
      return {
        error: "บัญชีผู้ใช้ไม่ตรงกับข้อมูลพนักงาน กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่",
        status: 409 as const,
      };
    }

    const [leaveType] = await tx
      .select({ name: leaveTypes.name, annualQuotaDays: leaveTypes.annualQuotaDays, isActive: leaveTypes.isActive })
      .from(leaveTypes)
      .where(eq(leaveTypes.code, parsed.value.leaveTypeCode));
    if (!leaveType?.isActive) return { error: "Unknown or inactive leave type", status: 400 as const };

    if (leaveType.annualQuotaDays != null) {
      const reservedRows = await tx
        .select({ startOn: leaveRequests.startOn, endOn: leaveRequests.endOn, session: leaveRequests.session })
        .from(leaveRequests)
        .where(and(
          eq(leaveRequests.employeeId, user.employeeId),
          eq(leaveRequests.leaveTypeCode, parsed.value.leaveTypeCode),
          inArray(leaveRequests.statusCode, ["approved", "pending"]),
          gte(leaveRequests.startOn, startOfYear),
          lte(leaveRequests.startOn, endOfYear),
        ));
      const reservedDays = reservedRows.reduce((total, row) => total + leaveDaySpan(row.startOn, row.endOn, row.session), 0);
      const remainingDays = leaveType.annualQuotaDays - reservedDays;
      if (requestedDays > remainingDays) {
        return { error: leaveQuotaExceededMessage(leaveType.name, requestedDays, remainingDays), status: 409 as const };
      }
    }

    const [inserted] = await tx
      .insert(leaveRequests)
      .values({
        employeeId: user.employeeId,
        leaveTypeCode: parsed.value.leaveTypeCode,
        startOn: parsed.value.startOn,
        endOn: parsed.value.endOn,
        session: parsed.value.session,
        reason: parsed.value.reason,
        statusCode: "pending",
      })
      .returning({ id: leaveRequests.id });
    return { id: inserted.id };
  });

  if ("error" in result) return jsonError(result.status, result.error);
  const item = await fetchLeaveItemById(result.id);
  return NextResponse.json({ item }, { status: 201 });
});
