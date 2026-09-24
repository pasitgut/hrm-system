import { and, desc, eq, gte, lt } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees, overtimeRequests, requestStatuses } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import {
  bangkokToUtcDate,
  currentBangkokMonth,
  fetchOtItemById,
  isValidDateStr,
  isValidMonthStr,
  isValidTimeStr,
  jsonError,
  monthRangeUtc,
  otSelectColumns,
  toOtItemDto,
} from "@/app/api/ot/_shared";

const STATUS_VALUES = new Set(["all", "pending", "approved", "rejected"]);

export const GET = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const searchParams = request.nextUrl.searchParams;

  const statusParam = searchParams.get("status") ?? "all";
  if (!STATUS_VALUES.has(statusParam)) {
    return jsonError(400, "Invalid status");
  }

  const monthParam = searchParams.get("month") ?? currentBangkokMonth();
  if (!isValidMonthStr(monthParam)) {
    return jsonError(400, "Invalid month");
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

  const { start, end } = monthRangeUtc(monthParam);

  const conditions = [gte(overtimeRequests.startAt, start), lt(overtimeRequests.startAt, end)];
  if (statusParam !== "all") conditions.push(eq(overtimeRequests.statusCode, statusParam));
  if (scopedEmployeeId) conditions.push(eq(overtimeRequests.employeeId, scopedEmployeeId));

  const rows = await db
    .select(otSelectColumns)
    .from(overtimeRequests)
    .innerJoin(employees, eq(overtimeRequests.employeeId, employees.id))
    .innerJoin(requestStatuses, eq(overtimeRequests.statusCode, requestStatuses.code))
    .where(and(...conditions))
    .orderBy(desc(overtimeRequests.startAt));

  return NextResponse.json({ items: rows.map(toOtItemDto) });
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

  const { date, startTime, endTime, reason, employeeId } = body as Record<string, unknown>;

  if (employeeId != null && employeeId !== user.employeeId) {
    return jsonError(400, "Cannot create an OT request for another employee");
  }
  if (!isValidDateStr(date) || !isValidTimeStr(startTime) || !isValidTimeStr(endTime)) {
    return jsonError(400, "Invalid date/time");
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return jsonError(400, "Reason is required");
  }

  const startAt = bangkokToUtcDate(date, startTime);
  const endAt = bangkokToUtcDate(date, endTime);
  if (endAt <= startAt) {
    return jsonError(400, "endTime must be after startTime");
  }

  const [inserted] = await db
    .insert(overtimeRequests)
    .values({
      employeeId: user.employeeId,
      startAt,
      endAt,
      reason: reason.trim(),
      statusCode: "pending",
    })
    .returning({ id: overtimeRequests.id });

  const item = await fetchOtItemById(inserted.id);
  return NextResponse.json({ item }, { status: 201 });
});
