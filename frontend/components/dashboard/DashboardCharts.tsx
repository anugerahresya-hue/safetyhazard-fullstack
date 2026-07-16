"use client";

import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/* ------------------------------------------------------------------ */
/* Data dashboard dari backend (/dashboard/stats). Bukan lagi dummy.   */
/* ------------------------------------------------------------------ */

export interface DashboardStats {
  total_inspections: number;
  total_hazards: number;
  active_hazards: number;
  critical_high: number;
  ppe_violations: number;
  risk_distribution: Record<string, number>;
  hazard_by_category: Record<string, number>;
  ppe_deficiencies: { type: string; count: number }[];
  weekly_trend: { day: string; date: string; hazards: number }[];
  recent_activity: { text: string; risk_level: string; at: string }[];
}

const BRAND = "#C8102E";

// Warna per level risiko untuk donut chart.
const RISK_COLORS: Record<string, string> = {
  critical: "#C8102E",
  high: "#F97316",
  medium: "#EAB308",
  low: "#22C55E",
};

// Warna titik aktivitas terbaru berdasarkan level risiko.
const ACTIVITY_DOT: Record<string, string> = {
  critical: "#C8102E",
  high: "#F97316",
  medium: "#EAB308",
  low: "#22C55E",
};

/** Tooltip kustom yang mengikuti tema (kartu + border tipis). */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number | string; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      {label !== undefined && (
        <p className="mb-1 font-semibold text-foreground">{label}</p>
      )}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5 text-muted">
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: entry.color || BRAND }}
          />
          {entry.name}:{" "}
          <span className="font-medium text-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Pembungkus kartu untuk setiap chart. */
function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="h-64 w-full">{children}</div>
    </div>
  );
}

/** Placeholder saat data kosong. */
function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-center text-sm text-muted">
      {text}
    </div>
  );
}

export function DashboardCharts({
  stats,
  loading,
}: {
  stats: DashboardStats | null;
  loading?: boolean;
}) {
  // Data turunan untuk chart.
  const riskDistribution = Object.entries(stats?.risk_distribution ?? {}).map(
    ([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: RISK_COLORS[name.toLowerCase()] ?? BRAND,
    })
  );
  const weeklyTrend = stats?.weekly_trend ?? [];
  const ppeDeficiencies = stats?.ppe_deficiencies ?? [];
  const recentActivity = stats?.recent_activity ?? [];

  const hasRisk = riskDistribution.some((r) => r.value > 0);
  const hasTrend = weeklyTrend.some((t) => t.hazards > 0);
  const hasPpe = ppeDeficiencies.some((p) => p.count > 0);

  const loadingText = loading ? "Loading..." : "No data yet";

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Donut — distribusi risiko */}
      <ChartCard title="Risk Distribution" subtitle="Active hazards by risk level">
        {hasRisk ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={riskDistribution}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                stroke="none"
              >
                {riskDistribution.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => <span className="text-muted">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text={loadingText} />
        )}
      </ChartCard>

      {/* Line — tren 7 hari */}
      <ChartCard title="7-Day Trend" subtitle="Hazards detected per day">
        {hasTrend ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklyTrend} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "currentColor" }} className="text-muted" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "currentColor" }} className="text-muted" tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span className="text-muted">{v}</span>} />
              <Line type="monotone" dataKey="hazards" name="Hazards" stroke={BRAND} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text={loadingText} />
        )}
      </ChartCard>

      {/* Bar — kekurangan APD */}
      <ChartCard title="PPE Deficiencies" subtitle="Missing protective equipment by type">
        {hasPpe ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ppeDeficiencies} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
              <XAxis dataKey="type" tick={{ fontSize: 11, fill: "currentColor" }} className="text-muted" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "currentColor" }} className="text-muted" tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(200,16,46,0.06)" }} />
              <Bar dataKey="count" name="Cases" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text={loadingText} />
        )}
      </ChartCard>

      {/* Aktivitas terbaru */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          Recent Activity
        </h3>
        {recentActivity.length > 0 ? (
          <ul className="space-y-3">
            {recentActivity.map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: ACTIVITY_DOT[item.risk_level] ?? BRAND }}
                />
                <span className="flex-1 truncate text-foreground">{item.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted">{loadingText}</p>
        )}
      </div>
    </div>
  );
}
