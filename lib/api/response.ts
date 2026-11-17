import { NextResponse } from "next/server";

// The single JSON error shape of the HRM API: `{ error: string }` plus the HTTP status.
export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}
