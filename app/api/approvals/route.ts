import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import {
  employees,
  leaveRequests,
  leaveTypes,
  overtimeRequests,
  requestStatuses,
} from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { formatOtDetail, formatThaiDateRange, jsonError, type ApprovalItem } from "@/app/api/approvals/_shared";

const TYPE_VALUES = new Set(["all", "leave", "ot"]);

// Combines pending/recent OT and leave requests into a single
// normalized, newest-first list. Used both as the central approvals queue
// (supervisor/ceo, unscoped) and as "my requests across everything" (an
// employee only ever sees their own rows here, same as every other list in
// the app). Three separate per-table queries, normalized and merged in
// application code — no DB-level UNION.
export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const typeParam = request.nextUrl.searchParams.get("type") ?? "all";
  if (!TYPE_VALUES.has(typeParam)) {
    return jsonError(400, "Invalid type");
  }

  const scopedEmployeeId = user.role === "employee" ? user.employeeId : undefined;

  const entries: Array<{ item: ApprovalItem; createdAt: Date }> = [];

  if (typeParam === "all" || typeParam === "ot") {
    const otConditions = scopedEmployeeId ? [eq(overtimeRequests.employeeId, scopedEmployeeId)] : [];
    const otRows = await db
      .select({
        id: overtimeRequests.id,
        employeeId: overtimeRequests.employeeId,
        employeeFirstName: employees.firstName,
        employeeLastName: employees.lastName,
        startAt: overtimeRequests.startAt,
        endAt: overtimeRequests.endAt,
        reason: overtimeRequests.reason,
        statusCode: overtimeRequests.statusCode,
        statusName: requestStatuses.name,
        createdAt: overtimeRequests.createdAt,
      })
      .from(overtimeRequests)
      .innerJoin(employees, eq(overtimeRequests.employeeId, employees.id))
      .innerJoin(requestStatuses, eq(overtimeRequests.statusCode, requestStatuses.code))
      .where(otConditions.length ? and(...otConditions) : undefined);

    for (const row of otRows) {
      entries.push({
        createdAt: row.createdAt,
        item: {
          id: row.id,
          type: "ot",
          kind: "ทำ OT",
          employeeId: row.employeeId,
          employeeName: `${row.employeeFirstName} ${row.employeeLastName}`.trim(),
          detail: formatOtDetail(row.startAt, row.endAt),
          reason: row.reason,
          submittedAt: row.createdAt.toISOString(),
          statusCode: row.statusCode,
          statusName: row.statusName,
        },
      });
    }
  }

  if (typeParam === "all" || typeParam === "leave") {
    const leaveConditions = scopedEmployeeId ? [eq(leaveRequests.employeeId, scopedEmployeeId)] : [];
    const leaveRows = await db
      .select({
        id: leaveRequests.id,
        employeeId: leaveRequests.employeeId,
        employeeFirstName: employees.firstName,
        employeeLastName: employees.lastName,
        startOn: leaveRequests.startOn,
        endOn: leaveRequests.endOn,
        leaveTypeName: leaveTypes.name,
        reason: leaveRequests.reason,
        statusCode: leaveRequests.statusCode,
        statusName: requestStatuses.name,
        createdAt: leaveRequests.createdAt,
      })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeCode, leaveTypes.code))
      .innerJoin(requestStatuses, eq(leaveRequests.statusCode, requestStatuses.code))
      .where(leaveConditions.length ? and(...leaveConditions) : undefined);

    for (const row of leaveRows) {
      entries.push({
        createdAt: row.createdAt,
        item: {
          id: row.id,
          type: "leave",
          kind: row.leaveTypeName,
          employeeId: row.employeeId,
          employeeName: `${row.employeeFirstName} ${row.employeeLastName}`.trim(),
          detail: `${formatThaiDateRange(row.startOn, row.endOn)} · ${row.leaveTypeName}`,
          reason: row.reason,
          submittedAt: row.createdAt.toISOString(),
          statusCode: row.statusCode,
          statusName: row.statusName,
        },
      });
    }
  }

  entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return NextResponse.json({ items: entries.map((entry) => entry.item) });
});
