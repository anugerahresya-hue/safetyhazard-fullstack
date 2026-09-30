import { cookies } from "next/headers";

export type UserRole = "admin" | "manager" | "inspector";

const VALID_ROLES: UserRole[] = ["admin", "manager", "inspector"];

/** Validasi sembarang nilai menjadi UserRole (atau null bila tidak sah). */
export function parseRole(value: string | undefined | null): UserRole | null {
  if (value && VALID_ROLES.includes(value as UserRole)) {
    return value as UserRole;
  }
  return null;
}

/**
 * Seperti parseRole, tetapi selalu mengembalikan peran valid.
 * Default "inspector" (hak akses paling sedikit) bila nilai tidak dikenali.
 */
export function resolveRole(value: string | undefined | null): UserRole {
  return parseRole(value) ?? "inspector";
}

export interface ActiveUser {
  name: string;
  role: UserRole;
}

/**
 * Baca sesi aktif dari cookie JWT FastAPI (Server Component / layout).
 * Cookie di-set oleh lib/auth.ts (client) saat login berhasil:
 * sh_token, sh_role, sh_name.
 *
 * Return null kalau belum login — proxy.ts sudah memastikan halaman
 * terproteksi tidak ter-render tanpa sesi valid, jadi ini jarang null
 * di praktiknya, tapi tetap dijaga untuk keamanan lapis kedua.
 */
export async function getActiveUser(): Promise<ActiveUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("sh_token")?.value;
  const role = cookieStore.get("sh_role")?.value;
  const name = cookieStore.get("sh_name")?.value;

  if (!token || !role) return null;

  return {
    name: name ? decodeURIComponent(name) : "User",
    role: resolveRole(role),
  };
}

/**
 * Baca peran aktif dari cookie sesi (Server Component / layout).
 * Default "inspector" bila belum login atau peran tidak dikenali.
 */
export async function getActiveRole(): Promise<UserRole> {
  const user = await getActiveUser();
  return user?.role ?? "inspector";
}
