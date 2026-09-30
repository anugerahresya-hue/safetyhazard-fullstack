import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

type Trend = "up" | "down";

export interface KPICardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Persen perubahan vs periode sebelumnya, mis. "+12%". */
  delta?: string;
  trend?: Trend;
  /**
   * Untuk metrik seperti "hazard", kenaikan itu buruk. Set `invertTrend`
   * agar warna delta merah saat naik dan hijau saat turun.
   */
  invertTrend?: boolean;
  /** Warna aksen ikon (kelas tailwind, mis. "text-brand"). */
  accent?: string;
  className?: string;
}

/**
 * Kartu metrik reusable untuk Dashboard. Border tipis, mendukung dark mode,
 * ikon lucide beraksen, dan indikator tren opsional.
 */
export function KPICard({
  label,
  value,
  icon: Icon,
  delta,
  trend = "up",
  invertTrend = false,
  accent = "text-brand",
  className,
}: KPICardProps) {
  // Tren "baik" = hijau, "buruk" = merah. invertTrend membalik makna.
  const isGood = invertTrend ? trend === "down" : trend === "up";

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5 shadow-sm transition-colors",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-muted">{label}</span>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg bg-foreground/5",
            accent
          )}
        >
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <p className="text-2xl font-bold tracking-tight text-foreground">
          {value}
        </p>
        {delta && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-semibold",
              isGood ? "text-green-600 dark:text-green-500" : "text-brand"
            )}
          >
            {trend === "up" ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
