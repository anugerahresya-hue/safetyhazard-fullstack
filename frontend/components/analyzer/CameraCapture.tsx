"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Loader2,
  AlertTriangle,
  Video,
  ImageUp,
  UploadCloud,
  X,
  ScanLine,
  Save,
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

type Mode = "camera" | "upload";
type CamStatus = "idle" | "loading" | "live" | "error";

/**
 * CameraCapture — analisis bahaya via kamera real-time ATAU unggah gambar.
 *
 * Semua kotak yang digambar berasal dari BACKEND (POST /inspections/live-preview
 * → YOLO + inferensi PPE), bukan lagi data tiruan. Overlay <canvas> ditumpuk di
 * atas media 16:9. Karena media pakai object-cover (ter-crop), koordinat bbox
 * (dalam piksel gambar sumber) dipetakan lewat transformasi "cover".
 *
 * - Live camera: ambil frame tiap ~2 detik, kirim ke backend, gambar kotak.
 *   Kotak bergerak/berubah mengikuti deteksi nyata dan HILANG saat tak ada
 *   hazard.
 * - Upload: pratinjau kotak langsung, plus lokasi + "Save & Analyze" untuk
 *   menyimpan inspeksi dan menjalankan analisa lengkap (tersimpan ke DB).
 */

const LIVE_INTERVAL_MS = 2000;

// ── Class colors ──────────────────────────────────────────
const CLASS_COLORS: Record<string, string> = {
  person:         "rgba(255, 0, 0, 0.9)",
  safety_helmet:  "rgba(0, 255, 0, 0.9)",
  safety_glasses: "rgba(0, 200, 255, 0.9)",
  safety_gloves:  "rgba(255, 165, 0, 0.9)",
  safety_boots:   "rgba(128, 0, 255, 0.9)",
  apron:          "rgba(255, 20, 147, 0.9)",
  trolley:        "rgba(255, 255, 0, 0.9)",
  phone:          "rgba(255, 69, 0, 0.9)",
};

/**
 * Gambar deteksi backend ke canvas. Format dari backend: bbox = {x1, y1, x2, y2, width, height} or [x1, y1, x2, y2].
 */
function drawBackendDetections(
  canvas: HTMLCanvasElement,
  source: HTMLVideoElement,
  detections: DetectionBox[],
  frameWidth?: number,
  frameHeight?: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  
  // Wait for video dimensions to be available
  if (!source.videoWidth || !source.videoHeight) return;
  
  // Set canvas size to match video's natural dimensions
  canvas.width = source.videoWidth;
  canvas.height = source.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Scale YOLO coords (in analysis-frame resolution, max 1280px) to canvas size
  const scaleX = frameWidth ? canvas.width / frameWidth : 1;
  const scaleY = frameHeight ? canvas.height / frameHeight : 1;

  for (const d of detections) {
    // Handle both bbox formats: array [x1, y1, x2, y2] or object {x1, y1, x2, y2}
    let x1: number, y1: number, x2: number, y2: number;
    if (Array.isArray(d.bbox)) {
      [x1, y1, x2, y2] = d.bbox;
    } else {
      // TypeScript type narrowing: bbox is object type here
      const bbox = d.bbox as { x1: number; y1: number; x2: number; y2: number; width: number; height: number };
      x1 = bbox.x1;
      y1 = bbox.y1;
      x2 = bbox.x2;
      y2 = bbox.y2;
    }
    
    // Scale to canvas pixel coordinates
    const px1 = x1 * scaleX;
    const py1 = y1 * scaleY;
    const pw  = (x2 - x1) * scaleX;
    const ph  = (y2 - y1) * scaleY;

    const color = d.danger ? "#ef4444" : (CLASS_COLORS[d.label] ?? "rgba(200, 200, 200, 0.9)");
    const label = `${d.label} ${Math.round(d.confidence * 100)}%`;

    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.strokeRect(px1, py1, pw, ph);

    ctx.font = "bold 14px system-ui";
    const tw = ctx.measureText(label).width + 12;
    ctx.fillStyle = color;
    ctx.fillRect(px1, Math.max(0, py1 - 22), tw, 22);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, px1 + 6, Math.max(14, py1 - 6));
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
  const [mode, setMode] = useState<Mode>("camera");

  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Kotak & dimensi sumber terakhir — disimpan di ref supaya redraw (resize)
  // selalu memakai nilai terbaru tanpa memicu re-render.
  const boxesRef = useRef<DetectionBox[]>([]);
  const srcDimRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const frameDimRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const liveTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const [status, setStatus] = useState<CamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Upload → simpan & analisa (location dihapus, pakai area sebagai location).
  const [area, setArea] = useState("spray_decoration");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // ID inspeksi yang sudah dianalisa (untuk tombol Generate PDF).
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  // ID report terakhir yang tergenerate (dipakai kalau ingin unduh ulang).
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [objectCount, setObjectCount] = useState(0);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Terapkan hasil deteksi dari backend: simpan, gambar, dan angkat ke parent.
  // Terapkan hasil deteksi dari backend (untuk upload mode)
  const applyDetections = useCallback(
    (
      boxes: DetectionBox[],
      srcW: number,
      srcH: number,
      summary?: DetectionSummary | null
    ) => {
      boxesRef.current = boxes;
      srcDimRef.current = { w: srcW, h: srcH };
      onDetections?.(boxes);
      if (summary !== undefined) onSummary?.(summary);
    },
    [onDetections, onSummary]
  );

  // Ambil satu frame dari <video> ke blob (di resolusi native video).
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
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0, off.width, off.height);
      off.toBlob((blob) => resolve(blob), "image/jpeg", 0.8);
    });
  }, []);

  // Kirim gambar (blob/file) ke backend live-preview → daftar kotak.
  const runDetection = useCallback(
    async (file: Blob, srcW: number, srcH: number) => {
      const form = new FormData();
      form.append("image", file, "frame.jpg");
      form.append("area", area || "general");
      const { data, ok } = await api.post<{
        detections: DetectionBox[];
        frame_width?: number;
        frame_height?: number;
        summary?: DetectionSummary;
      }>("/inspections/live-preview", form);
      if (ok && data && Array.isArray(data.detections)) {
        // Simpan dimensi frame analisis untuk scale factor di canvas
        frameDimRef.current = {
          w: data.frame_width || srcW,
          h: data.frame_height || srcH,
        };
        applyDetections(data.detections, srcW, srcH, data.summary ?? null);
      }
    },
    [applyDetections, area]
  );

  // Loop deteksi live dengan backend YOLO (kirim frame setiap ~2 detik)
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
      
      // Kirim frame ke backend setiap LIVE_INTERVAL_MS (2 detik)
      if (now - lastDetectionTime >= LIVE_INTERVAL_MS && !inFlightRef.current) {
        lastDetectionTime = now;
        inFlightRef.current = true;
        
        try {
          const blob = await captureFrame();
          if (blob && video.videoWidth && video.videoHeight) {
            await runDetection(blob, video.videoWidth, video.videoHeight);
            
            // Draw boxes from latest detection
            drawBackendDetections(canvas, video, boxesRef.current, frameDimRef.current.w || video.videoWidth, frameDimRef.current.h || video.videoHeight);
            setObjectCount(boxesRef.current.length);
          }
        } catch {
          // Swallow per-frame errors
        } finally {
          inFlightRef.current = false;
        }
      }

      // Update FPS
      frames++;
      if (now - t0 > 1000) {
        setFps(Math.round((frames * 1000) / (now - t0)));
        frames = 0;
        t0 = now;
      }

      liveTimerRef.current = requestAnimationFrame(() => void tick());
    };
    
    void tick();
  }, [onDetections, onSummary, captureFrame, runDetection]);

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
      onDetections?.([]); // reset panel: sudah aktif, belum ada hazard
      onSummary?.(null);
      // Bersihkan hasil analisa sebelumnya supaya tombol PDF lama tak nyangkut.
      setSaved(false);
      setInspectionId(null);
      setSaveError(null);
      setPdfError(null);
      boxesRef.current = [];
      setFps(0);
      setObjectCount(0);
      // Mulai loop deteksi real-time dengan backend YOLO
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

  // Validasi & muat video unggahan.
  const handleFile = (file: File | undefined) => {
    setUploadError(null);
    setSaveError(null);
    setSaved(false);
    if (!file) return;
    const okType = ["video/mp4", "video/mov", "video/avi", "video/webm"].includes(file.type);
    if (!okType) {
      setUploadError("Only MP4, MOV, AVI, or WEBM videos are allowed.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError("Video exceeds the 50 MB limit.");
      return;
    }
    setImageFile(file);
    boxesRef.current = [];
    onDetections?.(null);
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = useCallback(() => {
    setImageSrc(null);
    setImageFile(null);
    setUploadError(null);
    setSaveError(null);
    setSaved(false);
    setInspectionId(null);
    setPdfError(null);
    boxesRef.current = [];
    clearCanvas();
    onDetections?.(null);
    onSummary?.(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [clearCanvas, onDetections, onSummary]);

  // Ganti mode → hentikan kamera / bersihkan kanvas.
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "upload") stopCamera();
    if (next === "camera") clearImage();
    boxesRef.current = [];
    clearCanvas();
    onDetections?.(null);
    setMode(next);
  };

  // Saat video termuat: catat dimensi native, ekstrak frame pertama, lalu jalankan pratinjau deteksi.
  const onVideoLoad = async () => {
    const video = uploadVideoRef.current;
    if (!video || !imageFile) return;
    
    // Tunggu sampai video punya dimensi
    if (!video.videoWidth || !video.videoHeight) return;
    
    srcDimRef.current = { w: video.videoWidth, h: video.videoHeight };
    setPreviewing(true);
    
    try {
      // Ekstrak frame pertama sebagai blob untuk detection
      const off = document.createElement("canvas");
      off.width = video.videoWidth;
      off.height = video.videoHeight;
      const ctx = off.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, off.width, off.height);
        off.toBlob(async (blob) => {
          if (blob) {
            await runDetection(blob, video.videoWidth, video.videoHeight);
          }
        }, "image/jpeg", 0.8);
      }
    } catch {
      // Pratinjau gagal → biarkan video tanpa kotak; user tetap bisa Save.
    } finally {
      setPreviewing(false);
    }
  };

  // Simpan inspeksi + analisa lengkap (tersimpan ke DB). Menerima blob +
  // nama file supaya bisa dipakai baik oleh upload gambar MAUPUN capture
  // frame dari live camera.
  const saveAndAnalyze = async (blob: Blob, fileName: string) => {
    if (!area.trim()) {
      setSaveError("Area is required.");
      return;
    }
    setSaveError(null);
    setSaved(false);
    setInspectionId(null);
    setPdfError(null);
    setSaving(true);
    try {
      const form = new FormData();
      // Gunakan area sebagai location (location field dihapus dari UI)
      form.append("location", area.trim());
      form.append("area", area.trim());
      form.append("image", blob, fileName);

      const created = await api.post<{ inspection_id: string }>(
        "/inspections/",
        form
      );
      if (!created.ok || !created.data?.inspection_id) {
        setSaveError(
          (created.data as { detail?: string })?.detail ||
            "Failed to save inspection."
        );
        return;
      }

      const inspectionId = created.data.inspection_id;
      const analyzed = await api.post<{
        hazards: {
          yolo_label: string;
          risk_level: string;
          confidence_score: number;
        }[];
        summary?: DetectionSummary;
      }>(`/inspections/${inspectionId}/analyze`);

      if (!analyzed.ok) {
        setSaveError(
          (analyzed.data as { detail?: string })?.detail ||
            "Analysis failed. Please try again."
        );
        return;
      }

      // Perbarui panel dari hazard tersimpan (label -> kotak status).
      const boxes: DetectionBox[] = (analyzed.data?.hazards || []).map((h) => ({
        label: (h.yolo_label || "").replace(/_/g, " "),
        confidence: h.confidence_score || 0,
        danger: true,
        bbox: [0, 0, 0, 0],
      }));
      onDetections?.(boxes);
      onSummary?.(analyzed.data?.summary ?? null);
      setInspectionId(inspectionId);
      setSaved(true);
    } catch {
      setSaveError("Something went wrong while analyzing. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Upload: bungkus file terpilih.
  const saveUpload = () => {
    if (imageFile) saveAndAnalyze(imageFile, imageFile.name);
  };

  // Live camera: ambil frame saat ini lalu jalankan save+analyze.
  const captureAndAnalyze = async () => {
    const blob = await captureFrame();
    if (!blob) {
      setSaveError("Unable to capture a frame. Make sure the camera is live.");
      return;
    }
    await saveAndAnalyze(blob, `capture_${Date.now()}.jpg`);
  };

  // Generate PDF report untuk inspeksi yang baru dianalisa, lalu unduh
  // langsung (fetch berautentikasi → blob → download). Alur sama seperti
  // modal Reports supaya konsisten.
  const generatePdf = async () => {
    if (!inspectionId) return;
    setPdfError(null);
    setGeneratingPdf(true);
    try {
      const gen = await api.post<{ report_id: string }>(
        `/reports/generate/${inspectionId}`
      );
      if (!gen.ok || !gen.data?.report_id) {
        setPdfError(
          (gen.data as { detail?: string })?.detail ||
            "Failed to generate the report."
        );
        return;
      }
      const res = await fetch(
        `${BASE_URL}/reports/${gen.data.report_id}/download`,
        { headers: { Authorization: `Bearer ${getClientToken() ?? ""}` } }
      );
      if (!res.ok) {
        setPdfError("Report generated but the download failed.");
        return;
      }
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

  // Bersihkan stream & timer saat unmount.
  useEffect(() => {
    return () => {
      stopLiveLoop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [stopLiveLoop]);

  const isLive = status === "live";

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      {/* Header + tab mode */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Live Camera Feed
          </h2>
          <p className="text-xs text-muted">
            Real-time PPE &amp; hazard detection
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={status} />
        </div>
      </div>

      {/* Wadah 16:9 — video + canvas overlay ditumpuk */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      >
        {/* Video (mode kamera) */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 size-full object-cover"
        />

        {/* Canvas transparan untuk bounding box */}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 size-full"
        />

        {/* FPS & object count indicator (live camera) */}
        {isLive && (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            LIVE · {fps} fps · {objectCount} objects
          </div>
        )}

        {/* Placeholder mode kamera (mati/error) */}
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

        {/* Spinner saat menyiapkan kamera */}
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-white/70" />
          </div>
        )}
      </div>

      {/* Form simpan & analisa. Ditampilkan untuk upload (gambar dipilih)
          MAUPUN live camera (kamera menyala) — hanya butuh Area untuk
          menyimpan inspeksi & menjalankan analisa. */}
      {((mode === "upload" && imageSrc) || (mode === "camera" && isLive)) && (
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
            </select>
          </div>
          {saveError && (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
              {saveError}
            </p>
          )}
          {pdfError && (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
              {pdfError}
            </p>
          )}
          {saved && (
            <div className="space-y-3 rounded-lg bg-green-500/10 px-3 py-3">
              <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-500">
                <CheckCircle2 className="size-4" />
                Inspection saved and analyzed. See it in Reports.
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
                  {generatingPdf ? "Generating PDF..." : "Generate PDF Report"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Kontrol */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {mode === "camera" ? (
          <>
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
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanLine className="size-4" />
              )}
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
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              <ImageUp className="size-4" />
              {imageSrc ? "Replace Video" : "Choose Video"}
            </button>
            <button
              type="button"
              onClick={saveUpload}
              disabled={!imageSrc || saving}
              className={cn(
                "flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {saving ? "Analyzing..." : "Save & Analyze"}
            </button>
            <button
              type="button"
              onClick={clearImage}
              disabled={!imageSrc}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <X className="size-4" />
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Tombol tab mode (Live Camera / Upload Image). */
function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-card text-brand shadow-sm"
          : "text-muted hover:text-foreground"
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      {label}
    </button>
  );
}

/** Lencana status kamera. */
function StatusPill({ status }: { status: CamStatus }) {
  const map = {
    idle: { label: "Offline", dot: "bg-slate-400", text: "text-muted" },
    loading: { label: "Connecting", dot: "bg-yellow-500", text: "text-muted" },
    live: {
      label: "Live",
      dot: "bg-green-500",
      text: "text-green-600 dark:text-green-500",
    },
    error: { label: "Error", dot: "bg-brand", text: "text-brand" },
  }[status];

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-foreground/5 px-2.5 py-1 text-xs font-medium",
        map.text
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          map.dot,
          status === "live" && "animate-pulse"
        )}
      />
      {map.label}
    </span>
  );
}
