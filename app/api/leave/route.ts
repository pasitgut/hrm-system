import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { departments, employees, leaveRequests, leaveTypes, requestStatuses } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import {
  fetchLeaveItemById,
  isActiveLeaveType,
  jsonError,
  leaveSelectColumns,
  parseLeaveInput,
  toLeaveItemDto,
} from "@/app/api/leave/_shared";

const STATUS_VALUES = new Set(["all", "pending", "approved", "rejected"]);

// Leave isn't calendar-scoped like OT (no `month` param), so the dashboard
// needs the complete set for its calendar and year-to-date summaries.

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const searchParams = request.nextUrl.searchParams;

  const statusParam = searchParams.get("status") ?? "all";
  if (!STATUS_VALUES.has(statusParam)) {
    return jsonError(400, "Invalid status");
  }

  const employeeIdParam = searchParams.get("employeeId");

  let scopedEmployeeId: string | undefined;
  if (user.role === "employee") {
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
    .select({ ...leaveSelectColumns, employeeDepartmentName: departments.name })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeCode, leaveTypes.code))
    .innerJoin(requestStatuses, eq(leaveRequests.statusCode, requestStatuses.code))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(leaveRequests.createdAt));

  return NextResponse.json({ items: rows.map((row) => ({ ...toLeaveItemDto(row), employeeDepartmentName: row.employeeDepartmentName })) });
});

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);

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

  if (!(await isActiveLeaveType(parsed.value.leaveTypeCode))) {
    return jsonError(400, "Unknown or inactive leave type");
  }

  const [inserted] = await db
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

  const item = await fetchLeaveItemById(inserted.id);
  return NextResponse.json({ item }, { status: 201 });
});
