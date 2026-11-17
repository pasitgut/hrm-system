export type OvertimeDayType = "weekday" | "holiday";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Day type of an OT request, derived from the date worked instead of a stored value:
 * "holiday" when the (Asia/Bangkok) date of `startAt` falls on one of the employee's
 * weekly days off (`employees.weekly_holidays`, 0 = Sunday ... 6 = Saturday), else "weekday".
 * Public holidays are not considered.
 */
export function deriveOvertimeType(startAt: Date, weeklyHolidays: readonly number[] | null | undefined): OvertimeDayType {
  const bangkokWeekday = new Date(startAt.getTime() + BANGKOK_OFFSET_MS).getUTCDay();
  return weeklyHolidays?.includes(bangkokWeekday) ? "holiday" : "weekday";
}
