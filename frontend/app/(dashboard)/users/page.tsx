"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { UserTable } from "@/components/users/UserTable";
import { AddUserModal } from "@/components/users/AddUserModal";

export default function UsersPage() {
  const [modalOpen, setModalOpen] = useState(false);
  // Dinaikkan setiap kali user baru dibuat → memicu UserTable memuat ulang.
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="mt-1 text-sm text-muted">
            Approve, edit, and manage EHSS user accounts
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
        >
          <UserPlus className="size-4" />
          Add New User
        </button>
      </div>

      {/* Tabel pengguna */}
      <UserTable reloadKey={reloadKey} />

      {/* Modal tambah pengguna */}
      <AddUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
