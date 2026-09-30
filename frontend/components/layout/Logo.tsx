import { cn } from "@/lib/utils";

/**
 * Logo SafetyHazard: perisai keselamatan (safety shield) merah + wordmark.
 * Kustom SVG, bukan lucide, agar bentuk perisai konsisten dengan brand.
 */
export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden="true"
      >
        {/* Perisai */}
        <path
          d="M16 2.5l11 4v8.2c0 6.9-4.6 13.3-11 15.3C9.6 28 5 21.6 5 14.7V6.5l11-4z"
          fill="#C8102E"
        />
        {/* Tanda centang keselamatan */}
        <path
          d="M11 15.8l3.4 3.4 6.6-6.8"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showText && (
        <span className="text-lg font-bold tracking-tight text-foreground">
          Safety<span className="text-brand">Hazard</span>
        </span>
      )}
    </div>
  );
}
