import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (Next.js 16 middleware convention) — edge auth guard.
 *
 * Defence-in-depth only: does a cheap cookie-presence + HMAC-structure check
 * to redirect obviously-unauthenticated requests before render. Full
 * cryptographic verification + DB session lookup happens in each Server
 * Component / route handler via getMerchantSession() / getStaffSession().
 *
 * Guards:
 *   /m/*        — merchant portal (except /m/login) -> merchant_session cookie
 *   /admin/*    — operator portal                    -> admin_session cookie
 */
function hasStructuredCookie(value: string | undefined): boolean {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  return dot > 0 && dot < value.length - 1;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Merchant portal: everything under /m except the auth pages.
  if (
    pathname.startsWith("/m") &&
    !pathname.startsWith("/m/login") &&
    !pathname.startsWith("/m/logout")
  ) {
    if (!hasStructuredCookie(request.cookies.get("merchant_session")?.value)) {
      const loginUrl = new URL("/m/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Operator portal: sub-routes under /admin (the /admin root is the login page).
  if (pathname.startsWith("/admin/")) {
    if (!hasStructuredCookie(request.cookies.get("admin_session")?.value)) {
      const loginUrl = new URL("/admin", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/m/:path*", "/admin/:path*"],
};
