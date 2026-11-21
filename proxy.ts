import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

const DISABLED_ASSET_PATHS = ["/api/assets", "/api/asset-loans", "/api/asset-categories"];

// Proxy redirects first-login sessions toward password setup. Route handlers
// and server actions still enforce authorization in lib/auth/dal.ts.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // These exact routes authenticate providers/service callers in their handlers.
  if (pathname === "/api/line/webhook" || pathname === "/api/internal/integrations/retry") {
    return NextResponse.next();
  }
  // Keep the asset implementation dormant without exposing its API routes.
  if (DISABLED_ASSET_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const isLoginPath = pathname === "/login";
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;
  const isAuthenticated = session !== null;
  const mustChangePassword = session?.mustChangePassword === true;
  const canChangePassword = pathname === "/change-password" || pathname === "/api/account/password";

  if (mustChangePassword && !canChangePassword) {
    return NextResponse.redirect(new URL("/change-password", request.url));
  }
  if (session && !mustChangePassword && pathname === "/change-password") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!isAuthenticated && !isLoginPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isLoginPath) {
    return NextResponse.redirect(new URL(mustChangePassword ? "/change-password" : "/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
