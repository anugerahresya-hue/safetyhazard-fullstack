"use client";

import { useEffect, useState } from "react";
import { X, UserPlus, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { UserRole } from "@/components/users/UserTable";

/**
 * AddUserModal — pop-up untuk menambah pengguna baru lewat POST /admin/users.
 * User yang dibuat admin langsung berstatus 'active'. Butuh password awal.
 * Backdrop gelap + kartu terpusat. Ditutup lewat X, Cancel, backdrop, atau Esc.
 */
export function AddUserModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("inspector");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form + tutup dengan Escape saat modal terbuka
  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPassword("");
    setRole("inspector");
    setError(null);
    setSaving(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Full name and email are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(null);
    setSaving(true);
    const { ok, data } = await api.post("/admin/users", {
      name: name.trim(),
      email: email.trim(),
      password,
      role,
    });
    setSaving(false);
    if (ok) {
      onSaved?.();
      onClose();
    } else {
      setError(
        (data as { detail?: string })?.detail || "Failed to create user."
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand/10 text-brand">
              <UserPlus className="size-5" strokeWidth={1.75} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Add New User
              </h2>
              <p className="text-xs text-muted">
                Create an account and assign a role
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Doe"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane.doe@mattel.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Temporary Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-brand"
            >
              <option value="inspector">Safety Inspector</option>
              <option value="manager">EHSS Manager</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          {error && (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-70"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
