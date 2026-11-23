import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { socialSecurityRates } from "@/lib/db/schema";

export type SocialSecurityRateRule = {
  id?: string;
  effectiveFrom: string; // YYYY-MM-DD
  label: string;
  employeeRatePercent: number;
  employerRatePercent: number;
  minWageBase: number;
  maxWageBase: number;
  note?: string | null;
};

export type SocialSecurityCalculation = {
  wageBase: number;
  clampedWageBase: number;
  employeeAmount: number;
  employerAmount: number;
  maxEmployeeAmount: number;
  maxEmployerAmount: number;
};

/**
 * Statutory Thai Social Security Section 33 ceiling schedule
 * (กฎกระทรวงกำหนดค่าจ้างขั้นต่ำและขั้นสูงที่ใช้เป็นฐานในการคำนวณเงินสมทบ พ.ศ. 2568
 * มีผลบังคับใช้ตั้งแต่ 1 มกราคม พ.ศ. 2569 เป็นต้นไป)
 */
export const DEFAULT_SOCIAL_SECURITY_RATES: SocialSecurityRateRule[] = [
  {
    effectiveFrom: "2020-01-01",
    label: "ฐานเพดานเดิม (พ.ศ. 2563–2568)",
    employeeRatePercent: 5,
    employerRatePercent: 5,
    minWageBase: 1650,
    maxWageBase: 15000,
    note: "เพดานค่าจ้าง 15,000 บาท สูงสุด 750 บาท/เดือน",
  },
  {
    effectiveFrom: "2026-01-01",
    label: "ระยะที่ 1 (พ.ศ. 2569–2571)",
    employeeRatePercent: 5,
    employerRatePercent: 5,
    minWageBase: 1650,
    maxWageBase: 17500,
    note: "กฎกระทรวง พ.ศ. 2568 ระยะที่ 1 เพดานค่าจ้าง 17,500 บาท สูงสุด 875 บาท/เดือน",
  },
  {
    effectiveFrom: "2029-01-01",
    label: "ระยะที่ 2 (พ.ศ. 2572–2574)",
    employeeRatePercent: 5,
    employerRatePercent: 5,
    minWageBase: 1650,
    maxWageBase: 20000,
    note: "กฎกระทรวง พ.ศ. 2568 ระยะที่ 2 เพดานค่าจ้าง 20,000 บาท สูงสุด 1,000 บาท/เดือน",
  },
  {
    effectiveFrom: "2032-01-01",
    label: "ระยะที่ 3 (พ.ศ. 2575 เป็นต้นไป)",
    employeeRatePercent: 5,
    employerRatePercent: 5,
    minWageBase: 1650,
    maxWageBase: 23000,
    note: "กฎกระทรวง พ.ศ. 2568 ระยะที่ 3 เพดานค่าจ้าง 23,000 บาท สูงสุด 1,150 บาท/เดือน",
  },
];

function isMissingSocialSecurityTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; cause?: unknown };
  if (record.code === "42P01") return true;
  if (typeof record.message === "string" && /relation ["']?social_security_rates["']? does not exist/i.test(record.message)) {
    return true;
  }
  return record.cause ? isMissingSocialSecurityTable(record.cause) : false;
}

/** Selects the active Social Security rate rule for the given YYYY-MM-DD date. */
export function resolveSocialSecurityRuleForDate(
  dateStr: string,
  rules: SocialSecurityRateRule[] = DEFAULT_SOCIAL_SECURITY_RATES,
): SocialSecurityRateRule {
  const source = rules.length > 0 ? rules : DEFAULT_SOCIAL_SECURITY_RATES;
  const sorted = [...source].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let matched = sorted[0];
  for (const rule of sorted) {
    if (rule.effectiveFrom <= dateStr) {
      matched = rule;
    } else {
      break;
    }
  }
  return matched;
}

/**
 * Calculates Thai Social Security Section 33 employee & employer contributions.
 * Standard SSO rule: wages > 0 are clamped to [minWageBase, maxWageBase],
 * multiplied by the contribution rate, and rounded to the nearest whole baht (>= 0.50 rounds up).
 */
export function calculateSocialSecurityContribution(
  wageBase: number,
  rule: SocialSecurityRateRule,
): SocialSecurityCalculation {
  const safeWage = Number.isFinite(wageBase) && wageBase > 0 ? wageBase : 0;
  const maxEmployeeAmount = Math.round(rule.maxWageBase * (rule.employeeRatePercent / 100));
  const maxEmployerAmount = Math.round(rule.maxWageBase * (rule.employerRatePercent / 100));

  if (safeWage <= 0) {
    return {
      wageBase: 0,
      clampedWageBase: 0,
      employeeAmount: 0,
      employerAmount: 0,
      maxEmployeeAmount,
      maxEmployerAmount,
    };
  }

  const clampedWageBase = Math.min(Math.max(safeWage, rule.minWageBase), rule.maxWageBase);
  const employeeAmount = Math.round(clampedWageBase * (rule.employeeRatePercent / 100));
  const employerAmount = Math.round(clampedWageBase * (rule.employerRatePercent / 100));

  return {
    wageBase: Math.round((safeWage + Number.EPSILON) * 100) / 100,
    clampedWageBase: Math.round((clampedWageBase + Number.EPSILON) * 100) / 100,
    employeeAmount,
    employerAmount,
    maxEmployeeAmount,
    maxEmployerAmount,
  };
}

/** Ensures the statutory default tiers exist when the settings table is empty. */
export async function ensureDefaultSocialSecurityRates(): Promise<SocialSecurityRateRule[]> {
  try {
    const existing = await db
      .select()
      .from(socialSecurityRates)
      .orderBy(asc(socialSecurityRates.effectiveFrom));

    if (existing.length > 0) {
      return existing.map((row) => ({
        id: row.id,
        effectiveFrom: row.effectiveFrom,
        label: row.label,
        employeeRatePercent: row.employeeRatePercent,
        employerRatePercent: row.employerRatePercent,
        minWageBase: row.minWageBase,
        maxWageBase: row.maxWageBase,
        note: row.note ?? null,
      }));
    }

    await db
      .insert(socialSecurityRates)
      .values(
        DEFAULT_SOCIAL_SECURITY_RATES.map((item) => ({
          effectiveFrom: item.effectiveFrom,
          label: item.label,
          employeeRatePercent: item.employeeRatePercent,
          employerRatePercent: item.employerRatePercent,
          minWageBase: item.minWageBase,
          maxWageBase: item.maxWageBase,
          note: item.note ?? null,
        })),
      )
      .onConflictDoNothing();

    const seeded = await db
      .select()
      .from(socialSecurityRates)
      .orderBy(asc(socialSecurityRates.effectiveFrom));

    return seeded.map((row) => ({
      id: row.id,
      effectiveFrom: row.effectiveFrom,
      label: row.label,
      employeeRatePercent: row.employeeRatePercent,
      employerRatePercent: row.employerRatePercent,
      minWageBase: row.minWageBase,
      maxWageBase: row.maxWageBase,
      note: row.note ?? null,
    }));
  } catch (error) {
    if (isMissingSocialSecurityTable(error)) {
      return DEFAULT_SOCIAL_SECURITY_RATES;
    }
    throw error;
  }
}

/** Reads the configured Social Security rate schedule (falls back to statutory defaults if empty). */
export async function listSocialSecurityRates(): Promise<SocialSecurityRateRule[]> {
  try {
    const rows = await db
      .select()
      .from(socialSecurityRates)
      .orderBy(asc(socialSecurityRates.effectiveFrom));
    if (rows.length === 0) return DEFAULT_SOCIAL_SECURITY_RATES;
    return rows.map((row) => ({
      id: row.id,
      effectiveFrom: row.effectiveFrom,
      label: row.label,
      employeeRatePercent: row.employeeRatePercent,
      employerRatePercent: row.employerRatePercent,
      minWageBase: row.minWageBase,
      maxWageBase: row.maxWageBase,
      note: row.note ?? null,
    }));
  } catch (error) {
    if (isMissingSocialSecurityTable(error)) {
      return DEFAULT_SOCIAL_SECURITY_RATES;
    }
    throw error;
  }
}

/** Returns the active Social Security rate rule for a payroll year & month. */
export async function getSocialSecurityRuleForPeriod(
  year: number,
  month: number,
): Promise<SocialSecurityRateRule> {
  const periodDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const rules = await listSocialSecurityRates();
  return resolveSocialSecurityRuleForDate(periodDate, rules);
}
