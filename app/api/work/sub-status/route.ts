import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { workTrackingRecords } from "@/lib/db/schema";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { isWorkTrackingStatus, jsonError, parseTrackingDate, toWorkTrackingApiRecord } from "@/app/api/work/_shared";

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

  const [record] = await db
    .select()
    .from(workTrackingRecords)
    .where(and(
      eq(workTrackingRecords.houseNo, input.houseNo.trim()),
      eq(workTrackingRecords.round, input.round.trim()),
      eq(workTrackingRecords.eventDate, eventDate),
    ))
    .limit(1);

  if (!record) return jsonError(404, "Work record not found");
  const hasSubtask = record.subStatuses.some((subStatus) => subStatus.detail === input.detail);
  if (!hasSubtask) return jsonError(404, "Subtask not found");

  const subStatuses = record.subStatuses.map((subStatus) =>
    subStatus.detail === input.detail ? { ...subStatus, status: input.status as typeof subStatus.status } : subStatus,
  );
  const [updated] = await db
    .update(workTrackingRecords)
    .set({ subStatuses, updatedAt: new Date() })
    .where(eq(workTrackingRecords.id, record.id))
    .returning();

  return NextResponse.json({ success: true, data: toWorkTrackingApiRecord(updated) });
});
