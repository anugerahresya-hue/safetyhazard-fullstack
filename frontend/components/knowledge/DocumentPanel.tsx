"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, FileText, X, Eye, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { getClientToken } from "@/lib/auth";
import type { UserRole } from "@/lib/session";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://web-production-07c27.up.railway.app";

type KbDoc = {
  id: string;
  title: string;
  file_url: string;
  category: string | null;
  uploaded_at: string;
};

/**
 * DocumentPanel — panel Knowledge Base EHSS (data nyata dari backend).
 *
 * - Daftar dokumen (GET /admin/ehss-docs) SELALU tampil untuk semua peran.
 * - Unggah (POST /admin/ehss-docs) & hapus (DELETE) HANYA untuk Admin.
 */
export function DocumentPanel({ role }: { role: UserRole }) {
  const isAdmin = role === "admin";

  const [dragging, setDragging] = useState(false);
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Guidelines");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Muat daftar dokumen saat mount.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, ok } = await api.get<KbDoc[]>("/admin/ehss-docs");
      if (!active) return;
      if (ok && Array.isArray(data)) {
        setDocs(data);
        if (data.length) setSelectedId(data[0].id);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Unggah PDF ke backend (satu per satu). Butuh title; pakai nama file kalau
  // title kosong.
  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !isAdmin) return;
    setError(null);
    const pdfs = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.name.endsWith(".pdf")
    );
    if (pdfs.length === 0) {
      setError("Only PDF files are allowed.");
      return;
    }

    setUploading(true);
    for (const file of pdfs) {
      const form = new FormData();
      form.append("title", title.trim() || file.name.replace(/\.pdf$/i, ""));
      form.append("category", category);
      form.append("file", file, file.name);
      const { data, ok } = await api.post<KbDoc>("/admin/ehss-docs", form);
      if (ok && data?.id) {
        setDocs((prev) => [data, ...prev]);
        setSelectedId((prev) => prev ?? data.id);
      } else {
        setError(
          (data as { detail?: string })?.detail || `Failed to upload ${file.name}.`
        );
      }
    }
    setUploading(false);
    setTitle("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const removeDoc = async (id: string) => {
    if (!isAdmin) return;
    const prev = docs;
    setDocs((d) => d.filter((doc) => doc.id !== id)); // optimistik
    const { ok } = await api.delete(`/admin/ehss-docs/${id}`);
    if (!ok) {
      setDocs(prev); // rollback
      setError("Failed to delete document.");
    }
  };

  // Buka PDF lewat backend (stream berautentikasi). Bucket 'ehss-docs' privat,
  // jadi tidak bisa dibuka langsung via URL publik Supabase.
  const viewDoc = async (id: string) => {
    setSelectedId(id);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/admin/ehss-docs/${id}/view`, {
        headers: { Authorization: `Bearer ${getClientToken() ?? ""}` },
      });
      if (!res.ok) {
        setError("Failed to open the document.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // Bebaskan setelah tab sempat memuat.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("Something went wrong opening the document.");
    }
  };

  const formatDate = (iso: string) => (iso ? iso.slice(0, 10) : "");

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">
          Knowledge Base
        </h2>
        <p className="text-sm text-muted">
          {isAdmin
            ? "Upload EHSS documents to power the AI assistant"
            : "Documents the AI assistant references"}
        </p>
      </div>

      {/* Zona unggah — KHUSUS Admin */}
      {isAdmin && (
        <>
          {/* Metadata dokumen */}
          <div className="mb-3 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">
                Document Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Fire Safety Protocol"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-brand"
              >
                <option>PPE</option>
                <option>Housekeeping</option>
                <option>Emergency</option>
                <option>Chemical Safety</option>
                <option>Machine Safety</option>
                <option>Electrical Safety</option>
                <option>Fire Safety</option>
                <option>Fall Protection</option>
              </select>
            </div>
          </div>

          {/* Drag & drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
              dragging
                ? "border-brand bg-brand/5"
                : "border-border hover:border-brand/60 hover:bg-foreground/[0.02]"
            )}
          >
            <UploadCloud
              className={cn("size-8", dragging ? "text-brand" : "text-muted")}
              strokeWidth={1.75}
            />
            <p className="mt-3 text-sm font-medium text-foreground">
              Click or drag PDF documents here
            </p>
            <p className="mt-1 text-xs text-muted">PDF only, up to 20 MB each</p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {uploading && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              Uploading...
            </p>
          )}
          {error && (
            <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">
              {error}
            </p>
          )}
        </>
      )}

      {/* Daftar dokumen — SELALU tampil untuk semua peran */}
      <div className={cn("flex min-h-0 flex-1 flex-col", isAdmin && "mt-5")}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Available Documents ({docs.length})
        </p>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {docs.map((doc) => {
            const active = doc.id === selectedId;
            return (
              <li
                key={doc.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(doc.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedId(doc.id);
                }}
                aria-pressed={active}
                className={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  active
                    ? "border-brand bg-brand/5"
                    : "border-border bg-background hover:border-brand/50"
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    active
                      ? "bg-brand text-white"
                      : "bg-brand/10 text-brand"
                  )}
                >
                  <FileText className="size-4.5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      active ? "text-brand" : "text-foreground"
                    )}
                  >
                    {doc.title}
                  </p>
                  <p className="text-xs text-muted">
                    {doc.category || "Uncategorized"}
                    {doc.uploaded_at ? ` · ${formatDate(doc.uploaded_at)}` : ""}
                  </p>
                </div>

                {/* Indikator terpilih */}
                {active && (
                  <span className="flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    <Check className="size-3" />
                    Active
                  </span>
                )}

                {/* Tombol View (semua peran) — stream lewat backend */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    viewDoc(doc.id);
                  }}
                  aria-label={`View ${doc.title}`}
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-foreground/5",
                    active ? "text-brand" : "text-muted hover:text-foreground"
                  )}
                >
                  <Eye className="size-4" />
                </button>

                {/* Hapus — KHUSUS Admin */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeDoc(doc.id);
                    }}
                    aria-label={`Remove ${doc.title}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-foreground/5 hover:text-brand group-hover:opacity-100"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
          {loading && (
            <li className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-6 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" />
              Loading documents...
            </li>
          )}
          {!loading && docs.length === 0 && (
            <li className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted">
              No documents available yet
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
