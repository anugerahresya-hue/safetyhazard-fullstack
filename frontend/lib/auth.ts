"use client";

import type { UserRole } from "@/lib/session";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 hari

export interface Session {
  token: string;
  role: UserRole;
  name: string;
}

/** Simpan session setelah login berhasil (dipanggil dari halaman login). */
export function setSession(session: Session) {
  document.cookie = `sh_token=${session.token}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  document.cookie = `sh_role=${session.role}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  document.cookie = `sh_name=${encodeURIComponent(session.name)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/** Hapus session — dipanggil saat Logout. */
export function clearSession() {
  document.cookie = "sh_token=; path=/; max-age=0";
  document.cookie = "sh_role=; path=/; max-age=0";
  document.cookie = "sh_name=; path=/; max-age=0";
}

/** Baca token dari cookie (client-side) — dipakai lib/api.ts untuk header Authorization. */
export function getClientToken(): string | null {
  const match = document.cookie.match(/(?:^|; )sh_token=([^;]*)/);
  return match ? match[1] : null;
}
