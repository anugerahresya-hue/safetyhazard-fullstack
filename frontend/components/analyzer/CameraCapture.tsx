"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Loader2,
  AlertTriangle,
  ScanLine,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { getClientToken } from "@/lib/auth";

import type {
  DetectionBox,
  DetectionSummary,
} from "@/components/analyzer/HazardResultPanel";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://web-production-07c27.up.railway.app";

type CamStatus = "idle" | "loading" | "live" | "error";

const LIVE_INTERVAL_MS = 2000;

function drawBackendDetections(
  canvas: HTMLCanvasElement,
  source: HTMLVideoElement,
  detections: DetectionBox[]
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  
  canvas.width = source.videoWidth;
  canvas.height = source.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const d of detections) {
    // Normalize bbox to [x1, y1, x2, y2] format
    let x1: number, y1: number, x2: number, y2: number;
    if (Array.isArray(d.bbox)) {
      [x1, y1, x2, y2] = d.bbox;
    } else {
      x1 = d.bbox.x1;
      y1 = d.bbox.y1;
      x2 = d.bbox.x2;
      y2 = d.bbox.y2;
    }
    
    const w = x2 - x1;
    const h = y2 - y1;
    const color = d.danger ? "#ef4444" : "#22c55e";
    const label = `${d.label} ${Math.round(d.confidence * 100)}%`;

    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.strokeRect(x1, y1, w, h);

    ctx.font = "bold 14px system-ui";
    const tw = ctx.measureText(label).width + 12;
    ctx.fillStyle = color;
    ctx.fillRect(x1, Math.max(0, y1 - 22), tw, 22);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x1 + 6, Math.max(14, y1 - 6));
  }
}

export function CameraCapture({
  onDetections,
  onSummary,
  onAreaChange,
}: {
  onDetections?: (d: DetectionBox[] | null) => void;
  onSummary?: (s: DetectionSummary | null) => void;
  onAreaChange?: (area: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const boxesRef = useRef<DetectionBox[]>([]);
  const liveTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const [status, setStatus] = useState<CamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [area, setArea] = useState("spray_decoration");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [objectCount, setObjectCount] = useState(0);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const applyDetections = useCallback(
    (
      boxes: DetectionBox[],
      srcW: number,
      srcH: number,
      summary?: DetectionSummary | null
    ) => {
      boxesRef.current = boxes;
      onDetections?.(boxes);
      if (summary !== undefined) onSummary?.(summary);
    },
    [onDetections, onSummary]
  );

  const captureFrame = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) {
        resolve(null);
        return;
      }
      const off = document.createElement("canvas");
      off.width = video.videoWidth;
      off.height = video.videoHeight;
      const ctx = off.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(video, 0, 0, off.width, off.height);
      off.toBlob((blob) => resolve(blob), "image/jpeg", 0.8);
    });
  }, []);

  const runDetection = useCallback(
    async (file: Blob, srcW: number, srcH: number) => {
      const form = new FormData();
      form.append("image", file, "frame.jpg");
      form.append("area", area || "general");
      const { data, ok } = await api.post<{
        detections: DetectionBox[];
        summary?: DetectionSummary;
      }>("/inspections/live-preview", form);
      if (ok && data && Array.isArray(data.detections)) {
        applyDetections(data.detections, srcW, srcH, data.summary ?? null);
      }
    },
    [applyDetections, area]
  );

  const runLiveLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let frames = 0;
    let t0 = performance.now();
    let lastDetectionTime = 0;

    const tick = async () => {
      if (!streamRef.current || !videoRef.current) return;
      
      const now = performance.now();
      
      if (now - lastDetectionTime >= LIVE_INTERVAL_MS && !inFlightRef.current) {
        lastDetectionTime = now;
        inFlightRef.current = true;
        
        try {
          const blob = await captureFrame();
          if (blob && video.videoWidth && video.videoHeight) {
            await runDetection(blob, video.videoWidth, video.videoHeight);
            
            if (boxesRef.current.length > 0) {
              drawBackendDetections(canvas, video, boxesRef.current);
              setObjectCount(boxesRef.current.length);
            } else {
              const ctx = canvas.getContext("2d");
              if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
              setObjectCount(0);
            }
          }
        } catch {
          // swallow per-frame errors
        } finally {
          inFlightRef.current = false;
        }
      }

      frames++;
      if (performance.now() - t0 > 1000) {
        setFps(Math.round((frames * 1000) / (performance.now() - t0)));
        frames = 0;
        t0 = performance.now();
      }

      liveTimerRef.current = requestAnimationFrame(() => void tick());
    };
    
    void tick();
  }, [captureFrame, runDetection]);

  const stopLiveLoop = useCallback(() => {
    if (liveTimerRef.current) {
      cancelAnimationFrame(liveTimerRef.current);
      liveTimerRef.current = null;
    }
  }, []);

  const startCamera = async () => {
    setError(null);
    setStatus("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("live");
      onDetections?.([]);
      onSummary?.(null);
      setSaved(false);
      setInspectionId(null);
      setSaveError(null);
      setPdfError(null);
      boxesRef.current = [];
      setFps(0);
      setObjectCount(0);
      stopLiveLoop();
      runLiveLoop();
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow access in your browser."
          : "Unable to access the camera. Check that a device is connected.";
      setError(message);
      setStatus("error");
    }
  };

  const stopCamera = useCallback(() => {
    stopLiveLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    boxesRef.current = [];
    clearCanvas();
    setStatus("idle");
    onDetections?.(null);
    onSummary?.(null);
  }, [clearCanvas, onDetections, onSummary, stopLiveLoop]);

  const saveAndAnalyze = async (blob: Blob, fileName: string) => {
    if (!area.trim()) { setSaveError("Area is required."); return; }
    setSaveError(null);
    setSaved(false);
    setInspectionId(null);
    setPdfError(null);
    setSaving(true);
    try {
      const form = new FormData();
      form.append("location", area.trim());
      form.append("area", area.trim());
      form.append("image", blob, fileName);

      const created = await api.post<{ inspection_id: string }>("/inspections/", form);
      if (!created.ok || !created.data?.inspection_id) {
        setSaveError((created.data as { detail?: string })?.detail || "Failed to save inspection.");
        return;
      }

      const id = created.data.inspection_id;
      const analyzed = await api.post<{
        hazards: { yolo_label: string; risk_level: string; confidence_score: number }[];
        summary?: DetectionSummary;
      }>(`/inspections/${id}/analyze`);

      if (!analyzed.ok) {
        setSaveError((analyzed.data as { detail?: string })?.detail || "Analysis failed.");
        return;
      }

      const boxes: DetectionBox[] = (analyzed.data?.hazards || []).map((h) => ({
        label: (h.yolo_label || "").replace(/_/g, " "),
        confidence: h.confidence_score || 0,
        danger: true,
        bbox: [0, 0, 0, 0],
      }));
      onDetections?.(boxes);
      onSummary?.(analyzed.data?.summary ?? null);
      setInspectionId(id);
      setSaved(true);

      // Auto-generate report otomatis setelah deteksi tersimpan, supaya
      // hasil langsung masuk ke halaman Reports tanpa klik tambahan.
      autoGenerateReport(id);
    } catch {
      setSaveError("Something went wrong while analyzing. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Auto-generate PDF report (tanpa download) untuk inspection yang baru
  // dianalisa. Dipanggil otomatis setelah save+analyze berhasil.
  const autoGenerateReport = async (id: string) => {
    setPdfError(null);
    try {
      const gen = await api.post<{ report_id: string }>(`/reports/generate/${id}`);
      if (!gen.ok || !gen.data?.report_id) {
        setPdfError(
          (gen.data as { detail?: string })?.detail ||
            "Failed to generate the report."
        );
        return;
      }
      setReportId(gen.data.report_id);
    } catch {
      // Non-fatal: report sudah disimpan, tombol Generate PDF tetap tersedia.
    }
  };

  // Live camera: ambil frame saat ini lalu jalankan save+analyze.
  const captureAndAnalyze = async () => {
    const blob = await captureFrame();
    if (!blob) { setSaveError("Unable to capture a frame. Make sure the camera is live."); return; }
    await saveAndAnalyze(blob, `capture_${Date.now()}.jpg`);
  };

  const generatePdf = async () => {
    if (!inspectionId) return;
    setPdfError(null);
    setGeneratingPdf(true);
    try {
      const gen = await api.post<{ report_id: string }>(`/reports/generate/${inspectionId}`);
      if (!gen.ok || !gen.data?.report_id) {
        setPdfError((gen.data as { detail?: string })?.detail || "Failed to generate the report.");
        return;
      }
      const res = await fetch(`${BASE_URL}/reports/${gen.data.report_id}/download`, {
        headers: { Authorization: `Bearer ${getClientToken() ?? ""}` },
      });
      if (!res.ok) { setPdfError("Report generated but the download failed."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${inspectionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError("Something went wrong generating the PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  useEffect(() => {
    return () => {
      stopLiveLoop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [stopLiveLoop]);

  const isLive = status === "live";

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Live Camera Feed</h2>
          <p className="text-xs text-muted">Real-time PPE &amp; hazard detection</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
        </div>
      </div>

      {/* Video + canvas overlay */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 size-full object-cover"
        />

        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 size-full"
        />

        {/* FPS indicator */}
        {isLive && (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            LIVE · {fps} fps · {objectCount} objects
          </div>
        )}

        {/* Camera off placeholder */}
        {!isLive && status !== "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            {status === "error" ? (
              <>
                <AlertTriangle className="size-10 text-brand" />
                <p className="max-w-xs px-4 text-sm text-white/80">{error}</p>
              </>
            ) : (
              <>
                <Camera className="size-10 text-white/40" strokeWidth={1.5} />
                <p className="text-sm text-white/50">Camera is off</p>
              </>
            )}
          </div>
        )}

        {/* Loading spinner */}
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-white/70" />
          </div>
        )}
      </div>

      {/* Area selector + save form — only when camera is live */}
      {isLive && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Area <span className="text-brand">*</span>
            </label>
            <select
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                onAreaChange?.(e.target.value);
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            >
              <option value="spray_decoration">Spray/Decoration Area</option>
              <option value="central_staging">Central Staging Area</option>
              <option value="assembly">Assembly Area</option>
              <option value="general">General Area</option>
            </select>
          </div>
          {saveError && (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{saveError}</p>
          )}
          {pdfError && (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{pdfError}</p>
          )}
          {saved && (
            <div className="space-y-3 rounded-lg bg-green-500/10 px-3 py-3">
              <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-500">
                <CheckCircle2 className="size-4" />
                {reportId
                  ? "Inspection saved and report generated automatically. See it in Reports."
                  : "Inspection saved and analyzed. See it in Reports."}
              </p>
              {inspectionId && (
                <button
                  type="button"
                  onClick={generatePdf}
                  disabled={generatingPdf}
                  className={cn(
                    "flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {generatingPdf ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                  {generatingPdf ? "Generating PDF..." : "Download PDF Report"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Controls — camera only */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={startCamera}
          disabled={isLive || status === "loading"}
          className={cn(
            "flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <Camera className="size-4" />
          Start Camera
        </button>
        <button
          type="button"
          onClick={captureAndAnalyze}
          disabled={!isLive || saving}
          className={cn(
            "flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
          {saving ? "Analyzing..." : "Capture & Analyze"}
        </button>
        <button
          type="button"
          onClick={stopCamera}
          disabled={!isLive}
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <CameraOff className="size-4" />
          Stop Camera
        </button>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: CamStatus }) {
  const map = {
    idle:    { label: "Offline",    dot: "bg-slate-400", text: "text-muted" },
    loading: { label: "Connecting", dot: "bg-yellow-500", text: "text-muted" },
    live:    { label: "Live",       dot: "bg-green-500", text: "text-green-600 dark:text-green-500" },
    error:   { label: "Error",      dot: "bg-brand",     text: "text-brand" },
  }[status];

  return (
    <span className={cn("flex items-center gap-1.5 rounded-full bg-foreground/5 px-2.5 py-1 text-xs font-medium", map.text)}>
      <span className={cn("size-2 rounded-full", map.dot, status === "live" && "animate-pulse")} />
      {map.label}
    </span>
  );
}