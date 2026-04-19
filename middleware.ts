import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { AUTH_SECRET } from "@/lib/auth-secret";

const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/transactions",
  "/cashflow",
  "/accounts",
  "/net-worth",
  "/recurring",
  "/categories",
  "/reports"
];

const ADMIN_ROUTE_PREFIXES = ["/admin"];

function matchesAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function buildLoginRedirect(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isAppRoute = matchesAny(pathname, APP_ROUTE_PREFIXES);
  const isAdminRoute = matchesAny(pathname, ADMIN_ROUTE_PREFIXES);

  if (!isAppRoute && !isAdminRoute) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: AUTH_SECRET
  });

  if ((isAppRoute || isAdminRoute) && !token?.sub) {
    return buildLoginRedirect(request);
  }

  if (isAdminRoute && token?.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/transactions/:path*",
    "/cashflow/:path*",
    "/accounts/:path*",
    "/net-worth/:path*",
    "/recurring/:path*",
    "/categories/:path*",
    "/reports/:path*",
    "/admin/:path*"
  ]
};
