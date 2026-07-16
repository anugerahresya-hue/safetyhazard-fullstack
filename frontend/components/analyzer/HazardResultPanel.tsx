import {
  HardHat,
  Shield,
  Droplets,
  Construction,
  Cable,
  FlaskConical,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ScanEye,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Panel status deteksi — diisi dari hasil deteksi backend (real-time  */
/* live-preview ATAU hasil analisa tersimpan). Bukan lagi dummy.       */
/* ------------------------------------------------------------------ */

/** Satu kotak deteksi yang dikembalikan backend (/inspections/live-preview). */
export interface DetectionBox {
  label: string;
  confidence: number;
  danger: boolean;
  bbox: [number, number, number, number];
}

// PPE yang dilacak backend (inferensi no_helmet / no_safety_vest).
const PPE_TRACKED: { label: string; icon: LucideIcon; violationLabel: string }[] = [
  { label: "Helmet", icon: HardHat, violationLabel: "no helmet" },
  { label: "Safety Vest", icon: Shield, violationLabel: "no safety vest" },
];

// Hazard lingkungan yang dilacak backend.
const ENV_TRACKED: { label: string; icon: LucideIcon; detectLabel: string }[] = [
  { label: "Wet Floor", icon: Droplets, detectLabel: "wet floor" },
  { label: "Blocked Walkway", icon: Construction, detectLabel: "blocked walkway" },
  { label: "Exposed Cable", icon: Cable, detectLabel: "exposed cable" },
  { label: "Chemical Spill", icon: FlaskConical, detectLabel: "chemical spill" },
];

/**
 * HazardResultPanel — status kelengkapan APD & bahaya lingkungan, dihitung
 * dari daftar `detections` hasil backend. Kalau `detections` null (belum
 * ada analisa) tampilkan placeholder; kalau kosong berarti area aman.
 */
export function HazardResultPanel({
  detections,
}: {
  detections?: DetectionBox[] | null;
}) {
  // Belum ada deteksi yang dijalankan sama sekali.
  if (detections == null) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Detection Status
        </h2>
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <ScanEye className="size-9 text-muted/50" strokeWidth={1.5} />
          <p className="text-sm text-muted">
            Start the camera or upload an image to run detection.
          </p>
        </div>
      </div>
    );
  }

  const labels = new Set(detections.map((d) => d.label.toLowerCase()));

  const ppe = PPE_TRACKED.map((p) => ({
    ...p,
    // "present" = TIDAK ada pelanggaran no_helmet/no_safety_vest terdeteksi.
    present: !labels.has(p.violationLabel),
  }));
  const env = ENV_TRACKED.map((e) => ({
    ...e,
    detected: labels.has(e.detectLabel),
  }));

  const missingCount = ppe.filter((p) => !p.present).length;
  const hazardCount = env.filter((e) => e.detected).length;
  const allClear = missingCount === 0 && hazardCount === 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Detection Status
        </h2>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            allClear
              ? "bg-green-500/10 text-green-600 dark:text-green-500"
              : "bg-brand/10 text-brand"
          )}
        >
          {allClear ? (
            <>
              <CheckCircle2 className="size-3.5" />
              All Clear
            </>
          ) : (
            <>
              <AlertTriangle className="size-3.5" />
              {missingCount + hazardCount} Issue
              {missingCount + hazardCount > 1 ? "s" : ""}
            </>
          )}
        </span>
      </div>

      {/* Section 1 — PPE Compliance */}
      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
          PPE Compliance
        </h3>
        <ul className="space-y-2">
          {ppe.map((item) => (
            <StatusRow
              key={item.label}
              icon={item.icon}
              label={item.label}
              ok={item.present}
              okLabel="Present"
              badLabel="Missing"
            />
          ))}
        </ul>
      </section>

      <hr className="my-4 border-border" />

      {/* Section 2 — Environmental Hazards */}
      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
          Environmental Hazards
        </h3>
        <ul className="space-y-2">
          {env.map((item) => (
            <StatusRow
              key={item.label}
              icon={item.icon}
              label={item.label}
              // Untuk bahaya lingkungan, "ok" = TIDAK terdeteksi.
              ok={!item.detected}
              okLabel="Clear"
              badLabel="Detected"
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Baris item dengan ikon di kiri dan lencana status di kanan. */
function StatusRow({
  icon: Icon,
  label,
  ok,
  okLabel,
  badLabel,
}: {
  icon: LucideIcon;
  label: string;
  ok: boolean;
  okLabel: string;
  badLabel: string;
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2.5 text-sm text-foreground">
        <Icon
          className={cn("size-4", ok ? "text-muted" : "text-brand")}
          strokeWidth={1.75}
        />
        {label}
      </span>
      <span
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
          ok
            ? "bg-green-500/10 text-green-600 dark:text-green-500"
            : "bg-brand/10 text-brand"
        )}
      >
        {ok ? (
          <CheckCircle2 className="size-3" />
        ) : (
          <XCircle className="size-3" />
        )}
        {ok ? okLabel : badLabel}
      </span>
    </li>
  );
}
