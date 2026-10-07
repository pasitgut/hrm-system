import { NextResponse } from "next/server";
import type { AssetAgreement, AssetRequest } from "@/asset-borrowing/domain/asset";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function agreementDto(agreement: AssetAgreement | null) {
  if (!agreement) return null;
  return {
    ...agreement,
    documentDate: dateOnly(agreement.documentDate),
    updatedAt: agreement.updatedAt?.toISOString() ?? null,
  };
}

export function assetRequestDto(item: AssetRequest) {
  const itemDetails = item.items.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name = "", quantityText = "1", note = ""] = line.split("|");
    return { name, quantity: Number(quantityText) || 1, note };
  });
  return {
    ...item,
    agreementId: item.agreementId,
    formDate: item.formDate.toISOString(),
    fromDate: dateOnly(item.fromDate),
    toDate: item.toDate ? dateOnly(item.toDate) : null,
    approvedBorrowDate: item.approvedBorrowDate?.toISOString() ?? null,
    agreement: agreementDto(item.agreement),
    itemDetails,
  };
}

function dateOnly(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function assetRequestDtos(items: AssetRequest[]) {
  return items.map(assetRequestDto);
}

export function requestId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
