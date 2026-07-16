"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { cn } from "@/lib/utils";
import { setSession } from "@/lib/auth";
import type { UserRole } from "@/lib/session";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Halaman Sign In — tata letak terpusat, kartu putih/gelap dengan tab minimalis
 * (Sign In / Request Access) dan tombol submit merah selebar layar.
 *
 * Autentikasi memakai JWT FastAPI sendiri (POST /auth/login) — BUKAN Supabase
 * Auth. Token disimpan di cookie sh_token via lib/auth.ts, lalu diverifikasi
 * ulang di proxy.ts pada setiap request ke rute terproteksi.
 */
export default function LoginPage() {
  // useSearchParams butuh Suspense boundary agar halaman bisa di-prerender.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.status === 403) {
        setError("Akun kamu masih menunggu persetujuan Admin.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(data.detail || "Email atau password salah.");
        setLoading(false);
        return;
      }

      setSession({ token: data.access_token, role: data.role as UserRole, name: data.name });

      // Cookie sudah tersimpan; refresh agar proxy & Server Components melihatnya.
      const from = params.get("from") || "/dashboard";
      router.push(from);
      router.refresh();
    } catch {
      setError("Gagal terhubung ke server. Coba lagi.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <AuthTabs active="signin" />

          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-foreground">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-muted">
              Sign in to your SafetyHazard account
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field
              icon={Mail}
              type="email"
              placeholder="you@mattel.com"
              label="Email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link
                href="/reset-password"
                className="text-sm font-medium text-brand hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            {error && (
              <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-70"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              Sign In
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-brand hover:underline">
            Request access
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Tab minimalis untuk berpindah antara Sign In & Request Access. */
export function AuthTabs({ active }: { active: "signin" | "register" }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-foreground/5 p-1">
      <Link
        href="/login"
        className={cn(
          "rounded-md py-2 text-center text-sm font-medium transition-colors",
          active === "signin"
            ? "bg-card text-brand shadow-sm"
            : "text-muted hover:text-foreground"
        )}
      >
        Sign In
      </Link>
      <Link
        href="/register"
        className={cn(
          "rounded-md py-2 text-center text-sm font-medium transition-colors",
          active === "register"
            ? "bg-card text-brand shadow-sm"
            : "text-muted hover:text-foreground"
        )}
      >
        Request Access
      </Link>
    </div>
  );
}

/** Input teks dengan ikon di kiri. */
function Field({
  icon: Icon,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>
    </div>
  );
}
