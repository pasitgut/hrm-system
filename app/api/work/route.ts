import { and, asc, gte, lte } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { workTrackingRecords } from "@/lib/db/schema";
import { requireApiAnyPermission, requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { getCheckerData } from "@/lib/work-tracking/checker";
import { formatTrackingDate, groupCheckerWorkTrackingRecords, jsonError, mergeWorkTrackingRecord, parseTrackingDate, toWorkTrackingApiRecord } from "@/app/api/work/_shared";

const VIEW_PERMISSIONS = ["work.view", "work.status.update", "work.create"] as const;

// Legacy-compatible work list: dates are inclusive and use DD/MM/YYYY.
export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiAnyPermission(request, ...VIEW_PERMISSIONS);

  const start = parseTrackingDate(request.nextUrl.searchParams.get("start"));
  const end = parseTrackingDate(request.nextUrl.searchParams.get("end"));
  if (!start || !end) return jsonError(400, "Invalid date range");
  if (start > end) return jsonError(400, "start must not be after end");

  try {
    const checkerRows = await getCheckerData(formatTrackingDate(start), formatTrackingDate(end));
    const checkerItems = groupCheckerWorkTrackingRecords(checkerRows);
    const localRows = await db
      .select()
      .from(workTrackingRecords)
      .where(and(gte(workTrackingRecords.eventDate, start), lte(workTrackingRecords.eventDate, end)))
      .orderBy(asc(workTrackingRecords.eventDate), asc(workTrackingRecords.createdAt));
    const localItems = localRows.map(toWorkTrackingApiRecord);
    const itemKey = (item: { houseNo: string; round: string; date: string }) =>
      `${item.houseNo}::${item.round}::${parseTrackingDate(item.date) ?? item.date}`;
    const localByKey = new Map(localItems.map((item) => [itemKey(item), item]));
    const checkerKeys = new Set(checkerItems.map(itemKey));
    const merged = checkerItems.map((item) => {
      const local = localByKey.get(itemKey(item));
      return local ? mergeWorkTrackingRecord(item, local) : item;
    });
    merged.push(...localItems.filter((item) => !checkerKeys.has(itemKey(item))));
    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    const message = error instanceof Error ? error.message : "API Checker request failed";
    console.error("Work tracking API Checker request failed", message);
    return jsonError(message.includes("CHECKER_API_") ? 503 : 502, message);
  }
});

// Keep the original create endpoint available even though the source page did
// not include a create form.
export const POST = withApiAuth(async (request: NextRequest) => {
  await requireApiPermission(request, "work.create");

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
  if (typeof input.detail !== "string" || !input.detail.trim()) return jsonError(400, "Detail is required");
  if (input.status != null && input.status !== "") return jsonError(400, "New work status must be empty");

  try {
    const [row] = await db
      .insert(workTrackingRecords)
      .values({
        eventDate,
        houseNo: input.houseNo.trim(),
        round: input.round.trim(),
        detail: input.detail.trim(),
      })
      .returning();
    return NextResponse.json({ success: true, data: toWorkTrackingApiRecord(row) }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return jsonError(409, "A work record already exists for this house, round, and date");
    }
    throw error;
  }
});
