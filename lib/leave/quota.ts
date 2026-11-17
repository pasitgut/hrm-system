export type LeaveQuotaBasis = "fixed" | "tenure";

export const LEAVE_QUOTA_BASES: readonly LeaveQuotaBasis[] = ["fixed", "tenure"];

export function isLeaveQuotaBasis(value: unknown): value is LeaveQuotaBasis {
  return value === "fixed" || value === "tenure";
}

function parts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month, day];
}

/** Whole months from `from` up to (not including) `until`, both "YYYY-MM-DD". Never negative. */
export function completedMonthsBetween(from: string, until: string): number {
  const [fromYear, fromMonth, fromDay] = parts(from);
  const [untilYear, untilMonth, untilDay] = parts(until);
  let months = (untilYear - fromYear) * 12 + (untilMonth - fromMonth);
  if (untilDay < fromDay) months -= 1;
  return Math.max(0, months);
}

/**
 * Days of a leave type the employee is entitled to in calendar `year`.
 *
 * - `annualQuotaDays` null  -> null (uncapped)
 * - basis "fixed"           -> annualQuotaDays for everyone
 * - basis "tenure"          -> annualQuotaDays is the maximum, reached after 12 completed months of service
 *   by the end of `year`; earlier it is pro-rated by completed months and rounded down
 *   (e.g. max 6, started 1 Jul -> 6 completed months -> 3 days).
 */
export function entitledQuotaDays(input: {
  annualQuotaDays: number | null;
  quotaBasis: LeaveQuotaBasis | string;
  startDate: string | null | undefined;
  year: number;
}): number | null {
  const { annualQuotaDays, quotaBasis, startDate, year } = input;
  if (annualQuotaDays == null) return null;
  if (quotaBasis !== "tenure" || !startDate) return annualQuotaDays;
  const months = completedMonthsBetween(startDate, `${year + 1}-01-01`);
  if (months >= 12) return annualQuotaDays;
  return Math.floor((annualQuotaDays * months) / 12);
}
