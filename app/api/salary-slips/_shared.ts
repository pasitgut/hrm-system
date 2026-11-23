import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiAuthError, withApiAuth } from "@/lib/auth/dal";
import { SlipError } from "@/lib/salary-slips/stateless";

function isAllowedOrigin(request: NextRequest, origin: string): boolean {
  if (origin === request.nextUrl.origin) return true;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const hostHeader = request.headers.get("host")?.trim().toLowerCase();
  const expectedHost = forwardedHost || hostHeader;
  if (!expectedHost) return false;
  return originUrl.host.toLowerCase() === expectedHost;
}

export function salaryRoute<Args extends unknown[]>(handler: (request: NextRequest, ...args: Args) => Promise<Response>) {
  return withApiAuth(async (request: NextRequest, ...args: Args) => {
    // Reject cross-origin mutations; API authentication alone does not prevent CSRF.
    const origin = request.headers.get("origin");
    if (request.method !== "GET" && origin && !isAllowedOrigin(request, origin)) {
      return NextResponse.json({ error: "Origin ไม่ถูกต้อง" }, { status: 403 });
    }
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof ApiAuthError) throw error;
      if (error instanceof SlipError) return NextResponse.json({ error: error.message }, { status: error.status });
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
      }
      console.error("Salary slip request failed", error instanceof Error ? error.name : "Unknown error");
      return NextResponse.json({ error: "ทำรายการไม่สำเร็จ กรุณาตรวจสอบไฟล์แล้วลองใหม่" }, { status: 500 });
    }
  });
}
