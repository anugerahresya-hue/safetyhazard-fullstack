import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy EHSS SafetyHazard (Next.js 16 — dahulu "middleware.ts").
 *
 * Sesi diverifikasi lewat cookie sh_token/sh_role yang di-set oleh
 * lib/auth.ts saat login berhasil ke FastAPI (BUKAN Supabase Auth —
 * backend punya tabel & JWT sendiri, terpisah total dari Supabase Auth).
 *
 * Proteksi berlapis:
 *  1. Belum login & masuk area terproteksi → /login.
 *  2. RBAC per-peran: rute terbatas sesuai peran → /dashboard.
 *  3. Sudah login tapi membuka halaman auth → /dashboard.
 */
type Role = "admin" | "manager" | "inspector";

const PROTECTED_PREFIXES = ["/dashboard", "/analyzer", "/reports", "/ehss-knowledge", "/users"];
const AUTH_ROUTES = ["/login", "/register", "/reset-password"];
const VALID_ROLES: Role[] = ["admin", "manager", "inspector"];

// RBAC: peran yang DIIZINKAN mengakses setiap rute terbatas.
const ROUTE_ACCESS: { prefix: string; allow: Role[] }[] = [
  { prefix: "/analyzer", allow: ["inspector"] },
  { prefix: "/users", allow: ["admin"] },
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get("sh_token")?.value;
  const rawRole = request.cookies.get("sh_role")?.value;
  const role = VALID_ROLES.includes(rawRole as Role) ? (rawRole as Role) : null;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // 1. Belum login tapi mencoba masuk area terproteksi → /login.
  if (isProtected && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. RBAC per-peran — peran tak diizinkan → /dashboard.
  if (isProtected && role) {
    const rule = ROUTE_ACCESS.find(
      (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
    );
    if (rule && !rule.allow.includes(role)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // 3. Sudah login tapi membuka halaman auth → /dashboard.
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
