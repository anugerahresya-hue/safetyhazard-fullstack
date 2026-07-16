"use client";

import { useEffect, useState } from "react";
import { KPICard } from "@/components/ui/KPICard";
import {
  DashboardCharts,
  type DashboardStats,
} from "@/components/dashboard/DashboardCharts";
import { api } from "@/lib/api";
import { ShieldAlert, HardHat, CheckCircle2, ScanEye } from "lucide-react";

/**
 * Dashboard EHSS — KPI cards + charts, semua dari data nyata (/dashboard/stats).
 * Endpoint role-scoped di backend: inspector hanya melihat datanya sendiri,
 * manager/admin melihat semua.
 */
export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, ok } = await api.get<DashboardStats>("/dashboard/stats");
      if (!active) return;
      if (ok && data) setStats(data);
      else setError("Failed to load dashboard data.");
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Live EHSS safety overview</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Active Hazards"
          value={loading ? "—" : stats?.active_hazards ?? 0}
          icon={ShieldAlert}
          accent="text-brand"
        />
        <KPICard
          label="PPE Violations"
          value={loading ? "—" : stats?.ppe_violations ?? 0}
          icon={HardHat}
          accent="text-orange-500"
        />
        <KPICard
          label="Critical / High"
          value={loading ? "—" : stats?.critical_high ?? 0}
          icon={CheckCircle2}
          accent="text-green-600 dark:text-green-500"
        />
        <KPICard
          label="Inspections"
          value={loading ? "—" : stats?.total_inspections ?? 0}
          icon={ScanEye}
          accent="text-blue-500"
        />
      </div>

      {/* Charts + activity */}
      <div className="mt-6">
        {error ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted">
            {error}
          </div>
        ) : (
          <DashboardCharts stats={stats} loading={loading} />
        )}
      </div>
    </div>
  );
}
