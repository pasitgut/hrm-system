import { NextResponse } from "next/server";

export function employeeDocumentError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}
