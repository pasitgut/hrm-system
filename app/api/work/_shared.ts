import { NextResponse } from "next/server";
import type { WorkTrackingApiRecord } from "@/lib/work-tracking/types";
import type { workTrackingRecords } from "@/lib/db/schema";
import { groupCheckerByKey, toChristian, type CheckerRow } from "@/lib/work-tracking/checker";

export const WORK_TRACKING_STATUSES = ["in_progress", "completed", "delivered"] as const;

export function jsonError(status: number, message: string) {
  return NextResponse.json({ success: false, message }, { status });
}

export function parseTrackingDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  let year: number;
  let month: number;
  let day: number;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const legacyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (isoMatch) {
    [, year, month, day] = isoMatch.map(Number) as [number, number, number, number];
  } else if (legacyMatch) {
    [, day, month, year] = legacyMatch.map(Number) as [number, number, number, number];
  } else {
    return null;
  }

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatTrackingDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const parsed = parseTrackingDate(iso);
  if (!parsed) return "";
  const [year, month, day] = parsed.split("-");
  return `${day}/${month}/${year}`;
}

export function calculateDeliveredDate(confirmDate: string, round: string): string {
  // Checker provides the confirmation date but no deadline field: round 1 gets
  // five calendar days, while later rounds get three.
  const eventDate = parseTrackingDate(toChristian(confirmDate));
  if (!eventDate) return "";
  const roundNumber = Number.parseInt(round.match(/\d+/)?.[0] ?? "", 10);
  const dayOffset = roundNumber === 1 ? 5 : 3;
  const [year, month, day] = eventDate.split("-").map(Number);
  return formatTrackingDate(new Date(Date.UTC(year, month - 1, day + dayOffset)));
}

export function isWorkTrackingStatus(value: unknown): value is (typeof WORK_TRACKING_STATUSES)[number] {
  return typeof value === "string" && WORK_TRACKING_STATUSES.includes(value as (typeof WORK_TRACKING_STATUSES)[number]);
}

type WorkTrackingRow = typeof workTrackingRecords.$inferSelect;

export function toWorkTrackingApiRecord(row: WorkTrackingRow): WorkTrackingApiRecord {
  return {
    houseNo: row.houseNo,
    round: row.round,
    date: formatTrackingDate(row.eventDate),
    projectText: row.projectText,
    detail: row.detail,
    status: row.status,
    deliveredDate: formatTrackingDate(row.deliveredDate),
    reportStatuses: row.reportStatuses ?? {},
    subStatuses: row.subStatuses ?? [],
    workers: JSON.stringify(row.workers ?? {}),
    itemCount: Math.max(row.subStatuses?.length ?? 0, 1),
  };
}

function objectValue(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string")) as Record<string, string>;
}

export function toCheckerWorkTrackingApiRecord(row: CheckerRow): WorkTrackingApiRecord {
  const rawStatus = row.status;
  const status = isWorkTrackingStatus(rawStatus) ? rawStatus : "in_progress";
  const developerNote = (row.house_developer_note ?? "").trim();
  const workers = row.workers ?? {};
  const deliveredDate = typeof row.deliveredDate === "string"
    ? row.deliveredDate
    : typeof row.delivered_date === "string" ? row.delivered_date : calculateDeliveredDate(row.confirm_date ?? "", row.inspect_no || "1");

  return {
    houseNo: (row.address_no ?? "").trim(),
    round: row.inspect_no || "1",
    date: toChristian(row.confirm_date ?? ""),
    projectText: row.project_text ?? "",
    detail: row.house_developer_note ?? "",
    status,
    deliveredDate: toChristian(deliveredDate),
    reportStatuses: objectValue(row.reportStatuses),
    subStatuses: [{ detail: developerNote, status, reportStatuses: objectValue(row.reportStatuses) }],
    workers: typeof workers === "string" ? workers : JSON.stringify(workers),
    requestStatus: row.request_status,
    itemCount: 1,
  };
}

function mergeWorkers(left: string, right: string): string {
  const readObject = (value: string): Record<string, unknown> => {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  };
  return JSON.stringify({ ...readObject(left), ...readObject(right) });
}

export function groupCheckerWorkTrackingRecords(rows: CheckerRow[]): WorkTrackingApiRecord[] {
  const grouped = new Map<string, WorkTrackingApiRecord>();

  for (const [houseRound, houseRows] of groupCheckerByKey(rows)) {
    for (const row of houseRows) {
      const item = toCheckerWorkTrackingApiRecord(row);
      const normalizedDate = parseTrackingDate(item.date) ?? item.date;
      const key = `${houseRound}::${normalizedDate}`;
      const current = grouped.get(key);

      if (!current) {
        grouped.set(key, item);
        continue;
      }

      current.itemCount = (current.itemCount ?? 1) + 1;
      current.subStatuses.push(...item.subStatuses);
      current.reportStatuses = { ...current.reportStatuses, ...item.reportStatuses };
      current.workers = mergeWorkers(current.workers, item.workers);
      if (!current.deliveredDate) current.deliveredDate = item.deliveredDate;
      if (!current.projectText) current.projectText = item.projectText;
      if (!current.detail) current.detail = item.detail;
    }
  }

  return [...grouped.values()];
}
