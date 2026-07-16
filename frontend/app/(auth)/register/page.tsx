"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  IdCard,
  Building2,
  ClipboardCheck,
  HardHat,
  CheckCircle2,
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { AuthTabs } from "@/app/(auth)/login/page";
import { cn } from "@/lib/utils";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Halaman Request Access (Register) — tata letak terpusat serasi dengan Sign In.
 *
 * Pendaftaran publik HANYA untuk peran Inspector & Manager (PRD 3A). Admin
 * ditambahkan oleh Admin lain lewat dasbor internal. Mendaftar lewat
 * POST /auth/register ke FastAPI (BUKAN Supabase Auth — lihat catatan di
 * login/page.tsx). Akun baru berstatus pending, menunggu persetujuan Admin.
 */

// Hanya dua peran yang boleh mendaftar publik.
const ROLES = [
  {
    value: "inspector",
    label: "Safety Inspector",
    desc: "Create & analyze inspections",
    icon: HardHat,
  },
  {
    value: "manager",
    label: "EHSS Manager",
    desc: "Monitor sites & reports",
    icon: ClipboardCheck,
  },
] as const;

type RoleValue = (typeof ROLES)[number]["value"];

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState<RoleValue>("inspector");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password) {
      setError("Name, email, and password are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          employee_id: employeeId,
          department,
        }),
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.detail || "Registration failed.");
        return;
      }
      setDone(true);
    } catch {
      setError("Gagal terhubung ke server. Coba lagi.");
      setLoading(false);
    }
  };

  // Layar sukses: menunggu persetujuan Admin.
  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md text-center">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="size-7" strokeWidth={1.75} />
            </span>
            <h1 className="text-xl font-semibold text-foreground">
              Request submitted
            </h1>
            <p className="mt-2 text-sm text-muted">
              Your account is pending admin approval. You&apos;ll be able to sign
              in once an administrator activates your access.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <AuthTabs active="register" />

          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-foreground">
              Request access
            </h1>
            <p className="mt-1 text-sm text-muted">
              Create your SafetyHazard account
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field
              icon={User}
              label="Full Name"
              placeholder="Jane Doe"
              value={name}
              onChange={setName}
              autoComplete="name"
            />
            <Field
              icon={Mail}
              type="email"
              label="Email"
              placeholder="you@mattel.com"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />

            <div className="grid grid-cols-2 gap-3">
              <Field
                icon={IdCard}
                label="Employee ID"
                placeholder="EMP-0000"
                value={employeeId}
                onChange={setEmployeeId}
              />
              <Field
                icon={Building2}
                label="Department"
                placeholder="Operations"
                value={department}
                onChange={setDepartment}
              />
            </div>

            {/* Pilihan peran — hanya Inspector & Manager */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Role
              </label>
              <div className="grid grid-cols-2 gap-3">
                {ROLES.map(({ value, label, desc, icon: Icon }) => {
                  const active = role === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRole(value)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-brand bg-brand/5"
                          : "border-border hover:border-brand/60"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5",
                          active ? "text-brand" : "text-muted"
                        )}
                        strokeWidth={1.75}
                      />
                      <span
                        className={cn(
                          "text-sm font-medium",
                          active ? "text-brand" : "text-foreground"
                        )}
                      >
                        {label}
                      </span>
                      <span className="text-xs text-muted">{desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Password + konfirmasi */}
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
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-brand focus:ring-2 focus:ring-brand/20"
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

            <Field
              icon={Lock}
              type={showPassword ? "text" : "password"}
              label="Confirm Password"
              placeholder="Re-enter password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />

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
              Request Access
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-brand hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Input teks dengan ikon di kiri (serasi dengan halaman Sign In). */
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
          className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>
    </div>
  );
}
