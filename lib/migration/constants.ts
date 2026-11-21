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

export const MAX_MIGRATION_FILE_BYTES = 25 * 1024 * 1024;
