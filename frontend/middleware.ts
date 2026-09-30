import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware EHSS SafetyHazard - Session & RBAC protection
 *
 * Session verified via sh_token/sh_role cookies set by lib/auth.ts
 * after successful login to FastAPI backend.
 *
 * Protection layers:
 *  1. Not logged in & accessing protected route → /login
 *  2. RBAC per-role: restricted routes per role → /dashboard
 *  3. Already logged in but accessing auth pages → /dashboard
 */
type Role = "admin" | "manager" | "inspector";

const PROTECTED_PREFIXES = ["/dashboard", "/analyzer", "/reports", "/ehss-knowledge", "/users"];
const AUTH_ROUTES = ["/login", "/register", "/reset-password"];
const VALID_ROLES: Role[] = ["admin", "manager", "inspector"];

// RBAC: roles ALLOWED to access each restricted route
const ROUTE_ACCESS: { prefix: string; allow: Role[] }[] = [
  { prefix: "/analyzer", allow: ["inspector"] },
  { prefix: "/users", allow: ["admin"] },
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get("sh_token")?.value;
  const rawRole = request.cookies.get("sh_role")?.value;
  const role = VALID_ROLES.includes(rawRole as Role) ? (rawRole as Role) : null;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // 1. Not logged in but trying to access protected area → /login
  if (isProtected && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. RBAC per-role — unauthorized role → /dashboard
  if (isProtected && role) {
    const rule = ROUTE_ACCESS.find(
      (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
    );
    if (rule && !rule.allow.includes(role)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // 3. Already logged in but accessing auth page → /dashboard
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
