import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { workTrackingRecords, workTrackingRequests } from "@/lib/db/schema";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import type { WorkTrackingRecordStatus, WorkTrackingSession } from "@/lib/work-tracking/types";
import { getCheckerData } from "@/lib/work-tracking/checker";
import { deriveWorkRecordStatus, formatTrackingDate, groupCheckerWorkTrackingRecords, isWorkTrackingStatus, jsonError, parseTrackingDate, toWorkTrackingApiRecord } from "@/app/api/work/_shared";

function parseWorkers(value: string): Record<string, WorkTrackingSession[]> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, WorkTrackingSession[]> : {};
  } catch {
    return {};
  }
}

export const PATCH = withApiAuth(async (request: NextRequest) => {
  await requireApiPermission(request, "work.status.update");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonError(400, "Invalid request body");
  }

  const input = body as Record<string, unknown>;
  const eventDate = parseTrackingDate(input.date);
  if (!eventDate) return jsonError(400, "Invalid date");
  if (typeof input.houseNo !== "string" || !input.houseNo.trim()) return jsonError(400, "House number is required");
  if (typeof input.round !== "string" || !input.round.trim()) return jsonError(400, "Round is required");
  if (typeof input.detail !== "string" || !input.detail.trim()) return jsonError(400, "Subtask detail is required");
  if (!isWorkTrackingStatus(input.status)) return jsonError(400, "Invalid work status");

  const houseNo = input.houseNo.trim();
  const round = input.round.trim();
  const detail = input.detail.trim();

  let [record] = await db
    .select()
    .from(workTrackingRecords)
    .where(and(
      eq(workTrackingRecords.houseNo, houseNo),
      eq(workTrackingRecords.round, round),
      eq(workTrackingRecords.eventDate, eventDate),
    ))
    .limit(1);

  if (!record || !record.subStatuses.some((subStatus) => subStatus.detail === input.detail)) {
    let checkerItem;
    try {
      const date = formatTrackingDate(eventDate);
      const checkerRows = await getCheckerData(date, date);
      checkerItem = groupCheckerWorkTrackingRecords(checkerRows).find((item) =>
        item.houseNo === houseNo
        && item.round === round
        && parseTrackingDate(item.date) === eventDate,
      );
    } catch (error) {
      return jsonError(502, error instanceof Error ? error.message : "API Checker request failed");
    }

    if (!checkerItem) return jsonError(404, "Work record or subtask not found");
    if (!checkerItem.subStatuses.some((subStatus) => subStatus.detail === input.detail)) {
      return jsonError(404, "Subtask not found");
    }

    if (!record) {
      [record] = await db
        .insert(workTrackingRecords)
        .values({
          houseNo: checkerItem.houseNo,
          round: checkerItem.round,
          eventDate,
          projectText: checkerItem.projectText,
          detail: checkerItem.detail,
          status: checkerItem.status,
          deliveredDate: parseTrackingDate(checkerItem.deliveredDate) || null,
          reportStatuses: checkerItem.reportStatuses,
          subStatuses: checkerItem.subStatuses,
          workers: parseWorkers(checkerItem.workers),
        })
        .onConflictDoNothing({
          target: [workTrackingRecords.houseNo, workTrackingRecords.round, workTrackingRecords.eventDate],
        })
        .returning();

      if (!record) {
        [record] = await db
          .select()
          .from(workTrackingRecords)
          .where(and(
            eq(workTrackingRecords.houseNo, houseNo),
            eq(workTrackingRecords.round, round),
            eq(workTrackingRecords.eventDate, eventDate),
          ))
          .limit(1);
      }
    } else {
      const subStatuses = [...record.subStatuses];
      for (const subStatus of checkerItem.subStatuses) {
        if (!subStatuses.some((current) => current.detail === subStatus.detail)) subStatuses.push(subStatus);
      }
      [record] = await db
        .update(workTrackingRecords)
        .set({
          projectText: record.projectText || checkerItem.projectText,
          deliveredDate: record.deliveredDate || parseTrackingDate(checkerItem.deliveredDate) || null,
          reportStatuses: { ...checkerItem.reportStatuses, ...record.reportStatuses },
          subStatuses,
          workers: Object.keys(record.workers).length ? record.workers : parseWorkers(checkerItem.workers),
          updatedAt: new Date(),
        })
        .where(eq(workTrackingRecords.id, record.id))
        .returning();
    }
  }

  if (!record) return jsonError(404, "Work record not found");

  const nextStatus = input.status as WorkTrackingRecordStatus;
  const subStatuses = record.subStatuses.map((subStatus) =>
    subStatus.detail === input.detail ? { ...subStatus, status: nextStatus } : subStatus,
  );
  const recordStatus = deriveWorkRecordStatus(subStatuses, record.status);
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(workTrackingRecords)
      .set({ subStatuses, status: recordStatus, updatedAt: now })
      .where(eq(workTrackingRecords.id, record.id))
      .returning();

    await tx
      .update(workTrackingRequests)
      .set({
        latestStatus: nextStatus,
        statusSource: "hrm",
        updatedAt: now,
      })
      .where(and(
        eq(workTrackingRequests.houseNo, houseNo),
        eq(workTrackingRequests.round, round),
        eq(workTrackingRequests.eventDate, eventDate),
        eq(workTrackingRequests.developerNote, detail),
      ));

    return row;
  });

  return NextResponse.json({ success: true, data: toWorkTrackingApiRecord(updated) });
});
