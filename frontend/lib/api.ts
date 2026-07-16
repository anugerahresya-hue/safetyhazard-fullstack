"use client";

import { getClientToken, clearSession } from "@/lib/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface ApiResult<T = any> {
  data: T;
  status: number;
  ok: boolean;
}

/**
 * Fetch wrapper ke FastAPI (Railway). Otomatis:
 * - inject header Authorization: Bearer <token> dari cookie sh_token
 * - kalau backend balikin 401 (token invalid/expired), hapus session
 *   dan redirect ke /login
 */
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const token = getClientToken();

  const headers: HeadersInit = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
  }

  let data: T;
  try {
    data = await res.json();
  } catch {
    data = {} as T;
  }

  return { data, status: res.status, ok: res.ok };
}

export const api = {
  get: <T = any>(path: string) => apiFetch<T>(path, { method: "GET" }),
  post: <T = any>(path: string, body?: any) =>
    apiFetch<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  patch: <T = any>(path: string, body?: any) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T = any>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
