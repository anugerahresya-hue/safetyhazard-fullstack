"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/layout/Logo";

/**
 * Halaman Reset Password — kirim tautan/token reset ke email.
 * Stage 2: disimulasikan. Backend menyimpan token reset di memori (lihat
 * email_service). Integrasi menyusul.
 */
export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 600);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          {sent ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto mb-4 size-12 text-green-500" />
              <h1 className="text-xl font-semibold text-foreground">
                Check your inbox
              </h1>
              <p className="mt-2 text-sm text-muted">
                If an account exists for {email}, a reset link is on its way.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 text-center">
                <h1 className="text-xl font-semibold text-foreground">
                  Reset password
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Enter your email to receive a reset link
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@mattel.com"
                      autoComplete="email"
                      className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-70"
                >
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  Send reset link
                </button>
              </form>
            </>
          )}
        </div>

        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}
