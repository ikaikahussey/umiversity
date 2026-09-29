import { NextResponse, type NextRequest } from "next/server";
import { E2E_COOKIE, e2eAuthEnabled } from "@/lib/auth/e2e";


function isProtected(pathname: string) {
  return (
    pathname.startsWith("/settings") ||
    pathname.startsWith("/admin") ||
    /^\/c\/[^/]+\/edit(\/|$)/.test(pathname)
  );
}

/** Redirects unauthenticated visitors away from protected routes and refreshes Neon Auth sessions. */
export default async function proxy(request: NextRequest) {
  if (!isProtected(request.nextUrl.pathname)) return NextResponse.next();
  if (e2eAuthEnabled() && request.cookies.get(E2E_COOKIE)) return NextResponse.next();
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET) {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }
  const { getAuth } = await import("@/lib/auth/server");
  return getAuth().middleware({ loginUrl: "/auth/sign-in" })(request);
}

export const config = {
  matcher: ["/settings/:path*", "/admin/:path*", "/c/:course/edit/:path*", "/c/:course/edit"],
};

