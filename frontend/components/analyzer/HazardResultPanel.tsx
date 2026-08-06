import {
  HardHat,
  Shield,
  Droplets,
  Construction,
  Cable,
  FlaskConical,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertTriangle,
  ScanEye,
  Glasses,
  Hand,
  ShirtIcon,
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
  bbox: [number, number, number, number] | { x1: number; y1: number; x2: number; y2: number; width: number; height: number };
}

/**
 * Ringkasan mentah deteksi dari backend. Panel PPE butuh tahu APAKAH ada
 * orang di frame supaya bisa membedakan "Present" (ada orang, pakai APD) dari
 * "No person" (tidak ada orang sama sekali). Tanpa ini panel salah lapor
 * "Present" saat frame kosong.
 */
export interface DetectionSummary {
  person_count: number;
  has_person: boolean;
  // Berapa orang yang APD-nya tidak terpakai (inferensi spasial per-orang),
  // per jenis PPE — cocok dengan label yang benar-benar dipakai backend
  // (no_safety_glasses / no_safety_gloves / no_apron / no_safety_helmet /
  // no_safety_boots), BUKAN "helmet"/"vest" generik yang tidak pernah dipakai.
  workers_missing_glasses?: number;
  workers_missing_gloves?: number;
  workers_missing_apron?: number;
  workers_missing_helmet?: number;
  workers_missing_boots?: number;
  env_hazards: string[];
  // Skor risiko agregat + band (safe/low/moderate/high/critical).
  risk_score?: number;
  risk_band?: string;
  // Flag untuk live camera client-side detection (COCO-SSD tidak bisa detect PPE)
  client_side_detection?: boolean;
}

// Band skor risiko → warna & label tampilan.
const RISK_BAND_META: Record<
  string,
  { label: string; badge: string; bar: string }
> = {
  safe: {
    label: "Safe",
    badge: "bg-green-500/10 text-green-600 dark:text-green-500",
    bar: "bg-green-500",
  },
  low: {
    label: "Low Risk",
    badge: "bg-green-500/10 text-green-600 dark:text-green-500",
    bar: "bg-green-500",
  },
  moderate: {
    label: "Moderate Risk",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-500",
    bar: "bg-amber-500",
  },
  high: {
    label: "High Risk",
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-500",
    bar: "bg-orange-500",
  },
  critical: {
    label: "Critical Risk",
    badge: "bg-brand/10 text-brand",
    bar: "bg-brand",
  },
};

// Skor dipetakan ke lebar bar 0–100% dengan plafon di nilai ini (skor di atas
// ini dianggap "penuh"). Sekadar visual; band tetap sumber kebenaran.
const RISK_BAR_MAX = 30;

/**
 * Normalisasi label untuk pencocokan yang aman terhadap variasi format.
 * Backend/canvas kadang mengirim "no_apron" (underscore, raw yolo_label),
 * kadang "no apron" (spasi, hasil .replace("_", " ") di build_preview_boxes).
 * Tanpa normalisasi ini, pencocokan `labels.has(violationLabel)` gagal diam-diam
 * dan panel salah lapor "Present" padahal box merah jelas menunjukkan pelanggaran.
 */
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/_/g, " ").trim();
}

// Area-specific PPE requirements. `summaryKey` menghubungkan item ini ke
// field count di DetectionSummary supaya note "x of y workers" akurat per-item
// (bukan digeneralisir ke helmet/vest seperti sebelumnya).
type PPEItem = {
  label: string;
  icon: LucideIcon;
  violationLabel: string;
  summaryKey: keyof DetectionSummary;
};

const AREA_PPE_MAP: Record<string, PPEItem[]> = {
  spray_decoration: [
    { label: "Safety Glasses", icon: Glasses, violationLabel: "no safety glasses", summaryKey: "workers_missing_glasses" },
    { label: "Safety Gloves", icon: Hand, violationLabel: "no safety gloves", summaryKey: "workers_missing_gloves" },
    { label: "Apron", icon: ShirtIcon, violationLabel: "no apron", summaryKey: "workers_missing_apron" },
  ],
  central_staging: [
    { label: "Safety Helmet", icon: HardHat, violationLabel: "no safety helmet", summaryKey: "workers_missing_helmet" },
    { label: "Safety Boots", icon: Shield, violationLabel: "no safety boots", summaryKey: "workers_missing_boots" },
  ],
  assembly: [
    // Assembly area focuses on lane violations, not PPE
  ],
};

// Fallback untuk area yang tidak dikenali
const DEFAULT_PPE: PPEItem[] = [];

function getPPEForArea(area: string): PPEItem[] {
  return AREA_PPE_MAP[area] || DEFAULT_PPE;
}

// Area-specific environmental hazard tracking
type EnvItem = { label: string; icon: LucideIcon; detectLabel: string };

const AREA_ENV_MAP: Record<string, EnvItem[]> = {
  spray_decoration: [
    { label: "Wet Floor", icon: Droplets, detectLabel: "wet floor" },
    { label: "Chemical Spill", icon: FlaskConical, detectLabel: "chemical spill" },
    { label: "Exposed Cable", icon: Cable, detectLabel: "exposed cable" },
  ],
  central_staging: [
    { label: "Blocked Walkway", icon: Construction, detectLabel: "blocked walkway" },
    { label: "Exposed Cable", icon: Cable, detectLabel: "exposed cable" },
  ],
  assembly: [
    { label: "Blocked Walkway", icon: Construction, detectLabel: "blocked walkway" },
  ],
};

// Fallback untuk area yang tidak dikenali
const DEFAULT_ENV: EnvItem[] = [
  { label: "Wet Floor", icon: Droplets, detectLabel: "wet floor" },
  { label: "Blocked Walkway", icon: Construction, detectLabel: "blocked walkway" },
  { label: "Exposed Cable", icon: Cable, detectLabel: "exposed cable" },
  { label: "Chemical Spill", icon: FlaskConical, detectLabel: "chemical spill" },
];

function getEnvForArea(area: string): EnvItem[] {
  return AREA_ENV_MAP[area] || DEFAULT_ENV;
}

/**
 * HazardResultPanel — status kelengkapan APD, dihitung
 * dari daftar `detections` hasil backend. Kalau `detections` null (belum
 * ada analisa) tampilkan placeholder; kalau kosong berarti area aman.
 */
export function HazardResultPanel({
  detections,
  summary,
  area = "spray_decoration",
}: {
  detections?: DetectionBox[] | null;
  summary?: DetectionSummary | null;
  area?: string;
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

  // Get PPE requirements for selected area
  const PPE_TRACKED = getPPEForArea(area);
  // Get environmental hazards for selected area
  const ENV_TRACKED = getEnvForArea(area);

  // Normalisasi SEMUA label yang masuk sebelum dibandingkan — lihat komentar
  // di normalizeLabel(). Ini yang memperbaiki bug "Present" padahal box
  // merah nunjukin no_apron/no_safety_glasses/dst.
  const labels = new Set(detections.map((d) => normalizeLabel(d.label)));

  // Ada orang di frame? Utamakan summary dari backend; fallback: anggap ada
  // orang kalau ada pelanggaran PPE yang terdeteksi (pelanggaran hanya muncul
  // saat person terdeteksi).
  const hasPerson =
    summary?.has_person ??
    PPE_TRACKED.some((p) => labels.has(normalizeLabel(p.violationLabel)));

  // PPE tiga status:
  //   "none"    → tidak ada orang di frame (bukan "aman", cuma tak relevan)
  //   "present" → ada orang & APD terpakai
  //   "missing" → ada orang TAPI APD tidak terdeteksi (pelanggaran)
  const ppeWithConfidence = PPE_TRACKED.map((p) => {
    const violationHit = labels.has(normalizeLabel(p.violationLabel));
    const state = !hasPerson
      ? ("none" as const)
      : violationHit
      ? ("missing" as const)
      : ("present" as const);

    // Cari confidence dari box yang match label ini (violation ATAU item
    // itu sendiri), dinormalisasi juga supaya tidak gagal karena underscore.
    const wantedLabel = violationHit
      ? p.violationLabel
      : p.label;
    const detection = detections?.find(
      (d) => normalizeLabel(d.label) === normalizeLabel(wantedLabel)
    );
    const confidence = detection?.confidence ?? 0.9;

    // Berapa pekerja yang kena pelanggaran ini secara spesifik (dari summary
    // backend), bukan digeneralisir ke helmet/vest.
    const missingWorkers = (summary?.[p.summaryKey] as number | undefined) ?? 0;

    return { ...p, state, confidence, missingWorkers };
  });
  const env = ENV_TRACKED.map((e) => ({
    ...e,
    detected: labels.has(normalizeLabel(e.detectLabel)),
  }));

  const missingCount = ppeWithConfidence.filter((p) => p.state === "missing").length;
  const hazardCount = env.filter((e) => e.detected).length;
  const allClear = missingCount === 0 && hazardCount === 0;

  const workers = summary?.person_count ?? 0;

  // Skor risiko agregat. Backend sudah menghitung & memetakan ke band; panel
  // hanya menampilkan. Fallback "safe" kalau summary belum ada.
  const riskScore = summary?.risk_score ?? 0;
  const riskBand = summary?.risk_band ?? "safe";
  const bandMeta = RISK_BAND_META[riskBand] ?? RISK_BAND_META.safe;
  const barPct = Math.min(100, Math.round((riskScore / RISK_BAR_MAX) * 100));

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

      {/* Risk score agregat — menggabung SEMUA hazard (PPE + lingkungan)
          diboboti tingkat risiko & confidence. Lebih informatif daripada
          sekadar hitung jumlah issue. */}
      <section className="mb-4 rounded-lg border border-border bg-background/50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Risk Score
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              bandMeta.badge
            )}
          >
            {bandMeta.label}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {riskScore.toFixed(1)}
          </span>
          <span className="text-xs text-muted">risk points</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/20">
          <div
            className={cn("h-full rounded-full transition-all", bandMeta.bar)}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </section>

      {/* Section 1 — PPE Compliance */}
      <section className="mb-4">
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
          PPE Compliance
        </h3>
        {summary?.client_side_detection ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
            <p className="mb-2 text-xs font-semibold text-amber-600 dark:text-amber-500">
              ⚠️ Live Preview: Basic Object Detection Only
            </p>
            <p className="text-xs text-muted">
              PPE detection requires backend analysis. Use <strong>&quot;Capture &amp; Analyze&quot;</strong> button below for accurate PPE compliance assessment.
            </p>
          </div>
        ) : (
          <>
            {!hasPerson ? (
              <p className="mb-2.5 text-xs text-muted">
                No person detected in frame.
              </p>
            ) : (
              <p className="mb-2.5 text-xs text-muted">
                {workers} worker{workers === 1 ? "" : "s"} detected in frame.
              </p>
            )}
            <ul className="space-y-2">
              {ppeWithConfidence.map((item) => (
                <StatusRow
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  state={item.state}
                  note={
                    item.state === "missing" && item.missingWorkers > 0
                      ? `${item.missingWorkers} of ${workers}`
                      : undefined
                  }
                  confidence={item.confidence}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Section 2 — PPE Violations (only show if there are violations) */}
      {missingCount > 0 && (
        <section>
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
            PPE Violations
          </h3>
          <p className="mb-2.5 text-xs text-brand">
            {missingCount} violation{missingCount === 1 ? "" : "s"} detected
          </p>
          <ul className="space-y-2">
            {ppeWithConfidence.filter((p) => p.state === "missing").map((item) => (
              <StatusRow
                key={item.label}
                icon={item.icon}
                label={item.label}
                state={item.state}
                note={
                  item.missingWorkers > 0
                    ? `${item.missingWorkers} of ${workers}`
                    : undefined
                }
                confidence={item.confidence}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Baris item dengan ikon di kiri dan lencana status di kanan.
 *
 * State:
 *   present  → hijau "Present 95%"  (APD terpakai dengan confidence)
 *   clear    → hijau "Clear"    (bahaya lingkungan tidak ada)
 *   missing  → merah  "Missing 90%"  (APD tidak terpakai — pelanggaran dengan confidence)
 *   detected → merah  "Detected" (bahaya lingkungan terdeteksi)
 *   none     → abu    "No person" (tidak ada orang → APD tak relevan)
 */
type RowState = "present" | "clear" | "missing" | "detected" | "none";

function StatusRow({
  icon: Icon,
  label,
  state,
  note,
  confidence,
}: {
  icon: LucideIcon;
  label: string;
  state: RowState;
  note?: string;
  confidence?: number;
}) {
  const isOk = state === "present" || state === "clear";
  const isNone = state === "none";

  const pct = confidence ? Math.round(confidence * 100) : null;
  const text =
    state === "present"
      ? pct ? `Present ${pct}%` : "Present"
      : state === "clear"
      ? "Clear"
      : state === "missing"
      ? pct ? `Missing ${pct}%` : "Missing"
      : state === "detected"
      ? "Detected"
      : "No person";

  const badgeClass = isNone
    ? "bg-muted/10 text-muted"
    : isOk
    ? "bg-green-500/10 text-green-600 dark:text-green-500"
    : "bg-brand/10 text-brand";

  const iconColor = isNone ? "text-muted/50" : isOk ? "text-muted" : "text-brand";

  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2.5 text-sm text-foreground">
        <Icon className={cn("size-4", iconColor)} strokeWidth={1.75} />
        {label}
        {note && (
          <span className="text-xs text-muted">({note})</span>
        )}
      </span>
      <span
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
          badgeClass
        )}
      >
        {isNone ? (
          <MinusCircle className="size-3" />
        ) : isOk ? (
          <CheckCircle2 className="size-3" />
        ) : (
          <XCircle className="size-3" />
        )}
        {text}
      </span>
    </li>
  );
}