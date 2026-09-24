import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { assetLoans, assets, employees, requestStatuses } from "@/lib/db/schema";

// Shared helpers for the app/api/asset-loans/** Route Handlers: the
// GET /api/asset-loans response DTO and the joined select used to build it.
// assetLoans uses plain `date` columns (checkoutDate/dueDate, no time-of-day)
// — no Bangkok-offset math needed, just "YYYY-MM-DD" string validation. Not a
// route itself (no HTTP method exports), so Next.js ignores this file for
// routing purposes.

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function isValidDateStr(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Columns for the standard asset/employee/status join used by every asset
// loan read.
export const assetLoanSelectColumns = {
  id: assetLoans.id,
  assetId: assetLoans.assetId,
  assetCode: assets.code,
  assetName: assets.name,
  employeeId: assetLoans.employeeId,
  employeeFirstName: employees.firstName,
  employeeLastName: employees.lastName,
  employeeCode: employees.code,
  checkoutDate: assetLoans.checkoutDate,
  dueDate: assetLoans.dueDate,
  returnedAt: assetLoans.returnedAt,
  returnNote: assetLoans.returnNote,
  purpose: assetLoans.purpose,
  statusCode: assetLoans.statusCode,
  statusName: requestStatuses.name,
  decidedByEmployeeId: assetLoans.decidedByEmployeeId,
  decidedAt: assetLoans.decidedAt,
  decisionNote: assetLoans.decisionNote,
  cancelledByEmployeeId: assetLoans.cancelledByEmployeeId,
  cancelledAt: assetLoans.cancelledAt,
  createdAt: assetLoans.createdAt,
  updatedAt: assetLoans.updatedAt,
} as const;

type AssetLoanRow = {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeCode: string;
  checkoutDate: string;
  dueDate: string;
  returnedAt: Date | null;
  returnNote: string | null;
  purpose: string | null;
  statusCode: string;
  statusName: string;
  decidedByEmployeeId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  cancelledByEmployeeId: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AssetLoanItemDto = ReturnType<typeof toAssetLoanItemDto>;

export function toAssetLoanItemDto(row: AssetLoanRow) {
  return {
    id: row.id,
    assetId: row.assetId,
    assetCode: row.assetCode,
    assetName: row.assetName,
    employeeId: row.employeeId,
    employeeName: `${row.employeeFirstName} ${row.employeeLastName}`.trim(),
    employeeCode: row.employeeCode,
    checkoutDate: row.checkoutDate,
    dueDate: row.dueDate,
    returnedAt: row.returnedAt ? row.returnedAt.toISOString() : null,
    returnNote: row.returnNote,
    purpose: row.purpose,
    statusCode: row.statusCode,
    statusName: row.statusName,
    // Derived, not stored: "returned" is statusCode='approved' with
    // returnedAt set; "active" (asset currently out) is 'approved' with no
    // returnedAt yet.
    isActive: row.statusCode === "approved" && row.returnedAt === null,
    isReturned: row.statusCode === "approved" && row.returnedAt !== null,
    decidedByEmployeeId: row.decidedByEmployeeId,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    decisionNote: row.decisionNote,
    cancelledByEmployeeId: row.cancelledByEmployeeId,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function assetLoanBaseSelect() {
  return db
    .select(assetLoanSelectColumns)
    .from(assetLoans)
    .innerJoin(assets, eq(assetLoans.assetId, assets.id))
    .innerJoin(employees, eq(assetLoans.employeeId, employees.id))
    .innerJoin(requestStatuses, eq(assetLoans.statusCode, requestStatuses.code));
}

export async function fetchAssetLoanItemById(id: string): Promise<AssetLoanItemDto | null> {
  const [row] = await assetLoanBaseSelect().where(eq(assetLoans.id, id));
  return row ? toAssetLoanItemDto(row) : null;
}
