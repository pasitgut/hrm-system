import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import {
  employees,
  assetRequestItems,
  assetAgreements,
  assetRequests,
  leaveRequests,
  leaveTypes,
  overtimeRequests,
  requestStatuses,
} from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canManageAssets, canViewCompanyLeave, canViewCompanyOt } from "@/lib/auth/permissions";
import { formatOtDetail, formatThaiDateRange, jsonError, type ApprovalItem } from "@/app/api/approvals/_shared";

const TYPE_VALUES = new Set(["all", "leave", "ot", "asset"]);

// Combines OT, leave, and asset requests into a single
// normalized, newest-first list. Used both as the central approvals queue
// (permission-scoped company queues) and as "my requests across everything" (an
// employee only ever sees their own rows here, same as every other list in
// the app). Separate per-table queries, normalized and merged in
// application code — no DB-level UNION.
export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const typeParam = request.nextUrl.searchParams.get("type") ?? "all";
  if (!TYPE_VALUES.has(typeParam)) {
    return jsonError(400, "Invalid type");
  }

  const otEmployeeId = canViewCompanyOt(user.permissions) ? undefined : user.employeeId;
  const leaveEmployeeId = canViewCompanyLeave(user.permissions) ? undefined : user.employeeId;
  const assetEmployeeId = canManageAssets(user.permissions) ? undefined : user.employeeId;

  const entries: Array<{ item: ApprovalItem; createdAt: Date }> = [];

  if (typeParam === "all" || typeParam === "ot") {
    const otConditions = otEmployeeId ? [eq(overtimeRequests.employeeId, otEmployeeId)] : [];
    const otRows = await db
      .select({
        id: overtimeRequests.id,
        employeeId: overtimeRequests.employeeId,
        employeeFirstName: employees.firstName,
        employeeLastName: employees.lastName,
        startAt: overtimeRequests.startAt,
        endAt: overtimeRequests.endAt,
        overtimeType: overtimeRequests.overtimeType,
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
          overtimeType: row.overtimeType === "holiday" ? "holiday" : row.overtimeType === "weekday" ? "weekday" : null,
          reason: row.reason,
          submittedAt: row.createdAt.toISOString(),
          statusCode: row.statusCode,
          statusName: row.statusName,
        },
      });
    }
  }

  if (typeParam === "all" || typeParam === "leave") {
    const leaveConditions = leaveEmployeeId ? [eq(leaveRequests.employeeId, leaveEmployeeId)] : [];
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

  if (typeParam === "all" || typeParam === "asset") {
    const assetConditions = [isNull(assetRequests.deletedAt)];
    if (assetEmployeeId) assetConditions.push(eq(assetRequests.borrowerEmployeeId, assetEmployeeId));
    const assetRows = await db
      .select({
        id: assetRequests.id,
        employeeId: assetRequests.borrowerEmployeeId,
        employeeFirstName: employees.firstName,
        employeeLastName: employees.lastName,
        fromDate: assetRequests.fromDate,
        toDate: assetRequests.toDate,
        reason: assetRequests.reason,
        status: assetRequests.status,
        formDate: assetRequests.formDate,
        agreementTitle: assetAgreements.title,
        agreementStatus: assetAgreements.status,
      })
      .from(assetRequests)
      .innerJoin(employees, eq(assetRequests.borrowerEmployeeId, employees.id))
      .leftJoin(assetAgreements, eq(assetAgreements.id, assetRequests.agreementId))
      .where(and(...assetConditions));

    const requestIds = assetRows.map((row) => row.id);
    const assetItems = requestIds.length
      ? await db.select().from(assetRequestItems).where(inArray(assetRequestItems.requestId, requestIds)).orderBy(asc(assetRequestItems.position))
      : [];
    const itemsByRequest = new Map<string, typeof assetItems>();
    for (const item of assetItems) {
      const current = itemsByRequest.get(item.requestId) ?? [];
      current.push(item);
      itemsByRequest.set(item.requestId, current);
    }
    const statusNames = {
      pending: "รออนุมัติ",
      approved: "กำลังยืม",
      rejected: "ไม่อนุมัติ",
      return_pending: "รอตรวจรับคืน",
      returned: "คืนแล้ว",
      unknown: "ไม่ทราบสถานะ",
    };

    for (const row of assetRows) {
      const requestItems = itemsByRequest.get(row.id) ?? [];
      const itemNames = requestItems.map((item) => `${item.name} × ${item.quantity}`).join(", ");
      entries.push({
        createdAt: row.formDate,
        item: {
          id: row.id,
          type: "asset",
          kind: "ยืมทรัพย์สิน",
          employeeId: row.employeeId,
          employeeName: `${row.employeeFirstName} ${row.employeeLastName}`.trim(),
          detail: `${formatThaiDateRange(row.fromDate, row.toDate ?? row.fromDate)}${itemNames ? ` · ${itemNames}` : ""}`,
          reason: row.reason,
          submittedAt: row.formDate.toISOString(),
          statusCode: row.status,
          statusName: statusNames[row.status],
          assetItems: requestItems.map(({ name, quantity, note }) => ({ name, quantity, note })),
          requiresAssetWorkflow: row.status === "pending" && row.agreementTitle !== null,
        },
      });
    }
  }

  entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return NextResponse.json({ items: entries.map((entry) => entry.item) });
});
