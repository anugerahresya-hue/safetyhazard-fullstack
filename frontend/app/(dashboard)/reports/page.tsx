"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ReportFilter } from "@/components/reports/ReportFilter";
import {
  ReportDetailModal,
  RiskBadge,
  type ReportItem,
  type ReportStatus,
} from "@/components/reports/ReportDetailModal";
import { cn } from "@/lib/utils";
import { useLang } from "@/contexts/LanguageContext";

export default function ReportsPage() {
  const { t } = useLang();
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<ReportItem | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const FILTERS = [
    { key: "all", label: t.reports.filter_all },
    { key: "critical", label: t.reports.filter_critical },
    { key: "high", label: t.reports.filter_high },
    { key: "analyzed", label: t.reports.filter_analyzed },
    { key: "reported", label: t.reports.filter_reported },
  ];

  useEffect(() => {
    let active = true;
    (async () => {
      // Fetch current user to get role
      const userRes = await api.get<{ role: string }>("/auth/me");
      if (active && userRes.ok && userRes.data) {
        setUserRole(userRes.data.role);
      }
      
      // Fetch reports
      const { data, ok } = await api.get<ReportItem[]>("/reports/list");
      if (!active) return;
      if (ok && Array.isArray(data)) setReports(data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (filter === "all") return reports;
    return reports.filter((r) => r.status === filter || r.risk === filter);
  }, [filter, reports]);

  const handleDelete = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    
    const confirmed = window.confirm("Delete this report? This cannot be undone.");
    if (!confirmed) return;
    
    setDeleting(reportId);
    try {
      const result = await api.delete(`/reports/${reportId}`);
      if (result.ok) {
        // Remove from local state (no page refresh)
        setReports((prev) => prev.filter((r) => r.id !== reportId));
      } else {
        alert("Failed to delete report. Please try again.");
      }
    } catch (err) {
      alert("Error deleting report. Please try again.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.reports.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.reports.subtitle}
        </p>
      </div>

      {/* Filter pill */}
      <ReportFilter filters={FILTERS} active={filter} onChange={setFilter} />

      {/* Tabel laporan */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-semibold">{t.reports.table_date}</th>
                <th className="px-5 py-3 font-semibold">{t.reports.table_location}</th>
                <th className="px-5 py-3 font-semibold">{t.reports.table_inspector}</th>
                <th className="px-5 py-3 font-semibold">{t.reports.table_status}</th>
                <th className="px-5 py-3 font-semibold">{t.reports.table_risk}</th>
                <th className="px-5 py-3 text-right font-semibold">{t.reports.table_issues}</th>
                {userRole === "inspector" && (
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-foreground/5"
                >
                  <td className="whitespace-nowrap px-5 py-3.5 text-muted">
                    {r.date}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-foreground">
                    {r.location}
                  </td>
                  <td className="px-5 py-3.5 text-muted">{r.inspector}</td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <RiskBadge risk={r.risk} />
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-foreground">
                    {r.issues}
                  </td>
                  {userRole === "inspector" && (
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={(e) => handleDelete(r.report_id || r.id, e)}
                        disabled={deleting === (r.report_id || r.id)}
                        className="inline-flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                        title="Delete report"
                      >
                        {deleting === (r.report_id || r.id) ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted">
                    <Loader2 className="mx-auto mb-2 size-6 animate-spin opacity-60" />
                    {t.reports.loading}
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted">
                    <FileText className="mx-auto mb-2 size-8 opacity-40" />
                    {t.reports.no_match}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal detail */}
      <ReportDetailModal report={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const map: Record<ReportStatus, string> = {
    analyzed: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500",
    reported: "bg-blue-500/10 text-blue-600 dark:text-blue-500",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        map[status] ?? "bg-foreground/5 text-muted"
      )}
    >
      {status}
    </span>
  );
}
