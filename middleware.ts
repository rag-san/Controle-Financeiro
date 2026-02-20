import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/transactions",
  "/cashflow",
  "/accounts",
  "/net-worth",
  "/recurring",
  "/categories",
  "/reports",
  "/settings"
];

const ADMIN_ROUTE_PREFIXES = ["/admin"];
const AUTH_ROUTE_PREFIXES = ["/login"];

function matchesAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isAppRoute = matchesAny(pathname, APP_ROUTE_PREFIXES);
  const isAdminRoute = matchesAny(pathname, ADMIN_ROUTE_PREFIXES);
  const isAuthRoute = matchesAny(pathname, AUTH_ROUTE_PREFIXES);

  if (!isAppRoute && !isAdminRoute && !isAuthRoute) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  });

  if ((isAppRoute || isAdminRoute) && !token?.sub) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthRoute && token?.sub) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
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
    "/settings/:path*",
    "/admin/:path*"
  ]
};
