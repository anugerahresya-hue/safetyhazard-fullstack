"use client";

import { cn } from "@/lib/utils";

export interface FilterOption {
  key: string;
  label: string;
}

/**
 * ReportFilter — navigasi filter berbentuk pill yang bisa di-scroll horizontal.
 * Aktif: latar merah brand + teks putih. Non-aktif: outline halus.
 */
export function ReportFilter({
  filters,
  active,
  onChange,
}: {
  filters: FilterOption[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex gap-2 whitespace-nowrap">
        {filters.map((filter) => {
          const isActive = filter.key === active;
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => onChange(filter.key)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand text-white shadow-sm"
                  : "border border-border text-muted hover:bg-foreground/5 hover:text-foreground"
              )}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
