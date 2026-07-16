"use client";

import { useEffect, useState } from "react";
import {
  X,
  FileDown,
  Calendar,
  MapPin,
  User,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { getClientToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

export type ReportStatus = "analyzed" | "reported";
export type ReportRisk = "critical" | "high" | "medium" | "low";

/** Baris ringkas dari /reports/list. */
export interface ReportItem {
  id: string; // inspection_id
  report_id: string | null;
  date: string;
  location: string;
  area?: string | null;
  inspector: string;
  status: ReportStatus;
  risk: ReportRisk;
  issues: number;
  hazards: string[]; // kategori hazard (label)
}

interface HazardDetail {
  id: string;
  category: string;
  risk_level: string;
  confidence_score: number;
  yolo_label: string;
  corrective_actions: {
    action_description: string;
    priority: string;
    due_date: string;
    action_status: string;
  }[];
}

interface ReportDetailData {
  id: string;
  report_id: string | null;
  date: string;
  location: string;
  inspector: string;
  status: ReportStatus;
  risk: ReportRisk;
  issues: number;
  hazards: HazardDetail[];
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * ReportDetailModal — detail laporan inspeksi. Saat dibuka, mengambil detail
 * lengkap (hazard + corrective action) dari /reports/detail/{id}, dan bisa
 * mengekspor PDF lewat backend (generate + download).
 */
export function ReportDetailModal({
  report,
  onClose,
}: {
  report: ReportItem | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ReportDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Tutup dengan tombol Escape.
  useEffect(() => {
    if (!report) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report, onClose]);

  // Ambil detail saat modal dibuka.
  useEffect(() => {
    if (!report) {
      setDetail(null);
      setExportError(null);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      const { data, ok } = await api.get<ReportDetailData>(
        `/reports/detail/${report.id}`
      );
      if (!active) return;
      if (ok && data) setDetail(data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [report]);

  if (!report) return null;

  // Generate PDF (kalau belum ada) lalu unduh via fetch berautentikasi.
  const exportPdf = async () => {
    setExportError(null);
    setExporting(true);
    try {
      let reportId = detail?.report_id ?? report.report_id;
      // Generate dulu kalau belum pernah dibuat.
      const gen = await api.post<{ report_id: string }>(
        `/reports/generate/${report.id}`
      );
      if (gen.ok && gen.data?.report_id) {
        reportId = gen.data.report_id;
      } else if (!reportId) {
        setExportError(
          (gen.data as { detail?: string })?.detail ||
            "Failed to generate report."
        );
        return;
      }

      // Unduh PDF dengan header Authorization.
      const res = await fetch(`${BASE_URL}/reports/${reportId}/download`, {
        headers: { Authorization: `Bearer ${getClientToken() ?? ""}` },
      });
      if (!res.ok) {
        setExportError("Failed to download the PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${report.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Something went wrong exporting the PDF.");
    } finally {
      setExporting(false);
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Inspection Report
            </h2>
            <p className="text-xs text-muted">{report.location}</p>
          </div>
          <div className="flex items-center gap-3">
            <RiskBadge risk={report.risk} />
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-4">
            <DetailRow icon={Calendar} label="Date" value={report.date} />
            <DetailRow icon={MapPin} label="Location" value={report.location} />
            <DetailRow icon={User} label="Inspector" value={report.inspector} />
            <DetailRow
              icon={AlertTriangle}
              label="Total Issues"
              value={String(report.issues)}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Detected Hazards
            </p>
            {loading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" />
                Loading details...
              </div>
            ) : detail && detail.hazards.length > 0 ? (
              <ul className="space-y-2">
                {detail.hazards.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-lg bg-foreground/5 px-3 py-2.5 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <span className="size-1.5 rounded-full bg-brand" />
                        {h.category}
                      </span>
                      <RiskBadge risk={(h.risk_level as ReportRisk) ?? "low"} />
                    </div>
                    {h.corrective_actions[0] && (
                      <p className="mt-1.5 pl-3.5 text-xs text-muted">
                        {h.corrective_actions[0].action_description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-foreground/5 px-3 py-2 text-sm text-muted">
                No hazards recorded for this inspection.
              </p>
            )}
          </div>

          {exportError && (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
              {exportError}
            </p>
          )}
        </div>

        {/* Footer — ekspor */}
        <div className="flex items-center justify-end gap-3 border-t border-border p-5">
          <button
            type="button"
            onClick={exportPdf}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown className="size-4" />
            )}
            {exporting ? "Exporting..." : "Export to PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function RiskBadge({ risk }: { risk: ReportRisk }) {
  const map: Record<ReportRisk, string> = {
    critical: "bg-brand/10 text-brand",
    high: "bg-orange-500/10 text-orange-600 dark:text-orange-500",
    medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500",
    low: "bg-green-500/10 text-green-600 dark:text-green-500",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        map[risk] ?? "bg-foreground/5 text-muted"
      )}
    >
      {risk}
    </span>
  );
}
