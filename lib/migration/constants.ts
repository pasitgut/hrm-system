export const SHEET_EMPLOYEES = "ข้อมูลพนักงาน";
export const SHEET_ASSETS = "ข้อมูลการยืมทรัพย์สิน";
export const SHEET_OVERTIME = "ข้อมูลการทำโอที";
export const SHEET_LEAVE = "ข้อมูลการลา";
export const SHEET_WORK = "ข้อมูลงาน";

export const EXPECTED_SHEETS = [
  SHEET_EMPLOYEES,
  SHEET_ASSETS,
  SHEET_OVERTIME,
  SHEET_LEAVE,
  SHEET_WORK,
] as const;

export const MIGRATION_SECTIONS = [
  "employees",
  "overtime",
  "leave",
  "assets",
  "workTracking",
] as const;

export type MigrationSection = (typeof MIGRATION_SECTIONS)[number];

export const SHEET_BY_SECTION: Record<MigrationSection, (typeof EXPECTED_SHEETS)[number]> = {
  employees: SHEET_EMPLOYEES,
  overtime: SHEET_OVERTIME,
  leave: SHEET_LEAVE,
  assets: SHEET_ASSETS,
  workTracking: SHEET_WORK,
};

const MIGRATION_SECTION_SET = new Set<string>(MIGRATION_SECTIONS);

export function isMigrationSection(value: unknown): value is MigrationSection {
  return typeof value === "string" && MIGRATION_SECTION_SET.has(value);
}

export function parseMigrationSections(rawValues: readonly unknown[]): {
  sections: MigrationSection[];
  invalid: string[];
} {
  const picked = new Set<MigrationSection>();
  const invalid: string[] = [];

  for (const raw of rawValues) {
    if (typeof raw !== "string") {
      if (raw != null) invalid.push(String(raw));
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let tokens: unknown[];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        tokens = Array.isArray(parsed) ? parsed : [trimmed];
      } catch {
        invalid.push(trimmed);
        continue;
      }
    } else {
      tokens = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
    }

    for (const token of tokens) {
      if (isMigrationSection(token)) {
        picked.add(token);
      } else {
        invalid.push(String(token));
      }
    }
  }

  return {
    sections: MIGRATION_SECTIONS.filter((section) => picked.has(section)),
    invalid,
  };
}

export const MAX_MIGRATION_FILE_BYTES = 25 * 1024 * 1024;
