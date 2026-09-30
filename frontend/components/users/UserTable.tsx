"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type UserRole = "admin" | "manager" | "inspector";
export type UserStatus = "pending" | "active" | "inactive";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  employee_id: string | null;
  department: string | null;
}

/**
 * Tabel user — SEMUA operasi lewat FastAPI (/admin/users), BUKAN query
 * Supabase langsung dari browser. Backend yang enforce RBAC (admin_only)
 * dan aturan governance (admin tidak bisa hapus sesama admin/diri sendiri).
 */
export function UserTable({ reloadKey = 0 }: { reloadKey?: number }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AppUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data, ok } = await api.get<AppUser[]>("/admin/users");
    if (ok && Array.isArray(data)) setUsers(data);
    setLoading(false);
  }, []);

  // Refetch saat mount dan setiap kali reloadKey berubah (mis. user baru
  // ditambahkan dari modal).
  useEffect(() => {
    fetchUsers();
  }, [reloadKey, fetchUsers]);

  const deleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    const { ok, data } = await api.delete(`/admin/users/${id}`);
    if (ok) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } else {
      alert(data?.detail || "Failed to delete user.");
    }
  };

  const approveUser = async (id: string, status: "active" | "inactive") => {
    const { ok, data } = await api.patch(`/admin/users/${id}/approve`, { status });
    if (ok) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)));
    } else {
      alert(data?.detail || "Failed to update status.");
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-sm text-muted">Loading users...</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border text-sm text-muted">
            <th className="py-3 px-4">Name</th>
            <th className="py-3 px-4">Employee ID</th>
            <th className="py-3 px-4">Department</th>
            <th className="py-3 px-4">Role</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-border hover:bg-muted/50">
              <td className="py-3 px-4">
                <div className="font-medium">{user.name}</div>
                <div className="text-xs text-muted">{user.email}</div>
              </td>
              <td className="py-3 px-4 text-sm">{user.employee_id || "—"}</td>
              <td className="py-3 px-4 text-sm">{user.department || "—"}</td>
              <td className="py-3 px-4">
                <span
                  className={cn(
                    "px-2 py-1 rounded text-xs capitalize",
                    user.role === "admin" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                  )}
                >
                  {user.role}
                </span>
              </td>
              <td className="py-3 px-4">
                <span
                  className={cn(
                    "px-2 py-1 rounded text-xs font-semibold capitalize",
                    user.status === "active" && "bg-emerald-100 text-emerald-700",
                    user.status === "pending" && "bg-amber-100 text-amber-700",
                    user.status === "inactive" && "bg-slate-200 text-slate-600"
                  )}
                >
                  {user.status}
                </span>
              </td>
              <td className="py-3 px-4 flex gap-2 items-center">
                {user.status === "pending" ? (
                  <>
                    <button
                      onClick={() => approveUser(user.id, "active")}
                      className="text-xs font-semibold text-emerald-600 hover:underline"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => approveUser(user.id, "inactive")}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <button className="text-muted hover:text-brand" onClick={() => setEditing(user)}>
                    <Pencil size={16} />
                  </button>
                )}
                <button onClick={() => deleteUser(user.id)} className="text-muted hover:text-red-600">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <EditUserModal user={editing} onClose={() => setEditing(null)} onSaved={fetchUsers} />
      )}
    </div>
  );
}

/** Modal edit Employee ID & Department (PRD bag. F). */
function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: AppUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(user.employee_id || "");
  const [department, setDepartment] = useState(user.department || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { ok, data } = await api.patch(`/admin/users/${user.id}`, {
      employee_id: employeeId,
      department,
    });
    setSaving(false);
    if (ok) {
      onSaved();
      onClose();
    } else {
      alert(data?.detail || "Failed to update user.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Edit {user.name}</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Employee ID</label>
            <input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Department</label>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-foreground/5">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
