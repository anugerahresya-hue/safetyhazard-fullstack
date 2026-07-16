"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { ReportFilter } from "@/components/reports/ReportFilter";
import {
  ReportDetailModal,
  RiskBadge,
  type ReportItem,
  type ReportStatus,
} from "@/components/reports/ReportDetailModal";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All Reports" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High Risk" },
  { key: "analyzed", label: "Analyzed" },
  { key: "reported", label: "Reported" },
];

export default function ReportsPage() {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<ReportItem | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="mt-1 text-sm text-muted">
          Inspection history and exportable safety reports
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
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Location</th>
                <th className="px-5 py-3 font-semibold">Inspector</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Risk</th>
                <th className="px-5 py-3 text-right font-semibold">Issues</th>
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
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted">
                    <Loader2 className="mx-auto mb-2 size-6 animate-spin opacity-60" />
                    Loading reports...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted">
                    <FileText className="mx-auto mb-2 size-8 opacity-40" />
                    No reports match this filter.
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
