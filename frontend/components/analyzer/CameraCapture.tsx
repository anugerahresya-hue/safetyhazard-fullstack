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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { DetectionBox } from "@/components/analyzer/HazardResultPanel";

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

/**
 * Gambar kotak deteksi ke kanvas. `boxes` berkoordinat piksel gambar SUMBER
 * berukuran (srcW × srcH); dipetakan ke kanvas (canvas.width × canvas.height)
 * memakai transformasi object-cover (skala max + crop tengah) supaya selaras
 * dengan media yang tampil.
 */
export function drawDetections(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  boxes: DetectionBox[],
  srcW: number,
  srcH: number
) {
  ctx.clearRect(0, 0, canvasW, canvasH);
  if (!srcW || !srcH || boxes.length === 0) return;

  // object-cover: skala = max, media di-crop di tengah.
  const scale = Math.max(canvasW / srcW, canvasH / srcH);
  const dispW = srcW * scale;
  const dispH = srcH * scale;
  const offsetX = (canvasW - dispW) / 2;
  const offsetY = (canvasH - dispH) / 2;

  boxes.forEach((box) => {
    const [x1, y1, x2, y2] = box.bbox;
    const x = x1 * scale + offsetX;
    const y = y1 * scale + offsetY;
    const w = (x2 - x1) * scale;
    const h = (y2 - y1) * scale;
    const color = box.danger ? "#C8102E" : "#22C55E";

    ctx.lineWidth = Math.max(2, canvasW * 0.003);
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, h);

    const pct = Math.round((box.confidence || 0) * 100);
    const text = pct > 0 ? `${box.label} ${pct}%` : box.label;
    const fontSize = Math.max(12, Math.round(canvasW * 0.018));
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    const padX = fontSize * 0.5;
    const labelW = ctx.measureText(text).width + padX * 2;
    const labelH = fontSize * 1.6;
    const labelY = y - labelH < 0 ? y : y - labelH;

    ctx.fillStyle = color;
    ctx.fillRect(x, labelY, labelW, labelH);

    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + padX, labelY + labelH / 2);
  });
}

export function CameraCapture({
  onDetections,
}: {
  onDetections?: (d: DetectionBox[] | null) => void;
}) {
  const [mode, setMode] = useState<Mode>("camera");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Kotak & dimensi sumber terakhir — disimpan di ref supaya redraw (resize)
  // selalu memakai nilai terbaru tanpa memicu re-render.
  const boxesRef = useRef<DetectionBox[]>([]);
  const srcDimRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const [status, setStatus] = useState<CamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Upload → simpan & analisa.
  const [location, setLocation] = useState("");
  const [area, setArea] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Menyesuaikan resolusi kanvas ke ukuran tampilan, lalu menggambar kotak.
  const renderDetections = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const { width, height } = container.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = srcDimRef.current;
    drawDetections(ctx, width, height, boxesRef.current, w, h);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Terapkan hasil deteksi dari backend: simpan, gambar, dan angkat ke parent.
  const applyDetections = useCallback(
    (boxes: DetectionBox[], srcW: number, srcH: number) => {
      boxesRef.current = boxes;
      srcDimRef.current = { w: srcW, h: srcH };
      renderDetections();
      onDetections?.(boxes);
    },
    [onDetections, renderDetections]
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
      const { data, ok } = await api.post<{ detections: DetectionBox[] }>(
        "/inspections/live-preview",
        form
      );
      if (ok && data && Array.isArray(data.detections)) {
        applyDetections(data.detections, srcW, srcH);
      }
    },
    [applyDetections]
  );

  // Loop deteksi live: tiap tick ambil frame & kirim (skip kalau masih ada
  // request berjalan supaya tidak menumpuk).
  const liveTick = useCallback(async () => {
    if (inFlightRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    inFlightRef.current = true;
    try {
      const blob = await captureFrame();
      if (blob) {
        await runDetection(blob, video.videoWidth, video.videoHeight);
      }
    } catch {
      // Diamkan error per-frame; frame berikutnya coba lagi.
    } finally {
      inFlightRef.current = false;
    }
  }, [captureFrame, runDetection]);

  const stopLiveLoop = useCallback(() => {
    if (liveTimerRef.current) {
      clearInterval(liveTimerRef.current);
      liveTimerRef.current = null;
    }
  }, []);

  const startCamera = async () => {
    setError(null);
    setStatus("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1280, height: 720 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("live");
      onDetections?.([]); // reset panel: sudah aktif, belum ada hazard
      boxesRef.current = [];
      // Mulai loop deteksi berkala.
      stopLiveLoop();
      liveTimerRef.current = setInterval(liveTick, LIVE_INTERVAL_MS);
      // Tick pertama segera (jangan tunggu 2 detik).
      requestAnimationFrame(() => liveTick());
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
  }, [clearCanvas, onDetections, stopLiveLoop]);

  // Validasi & muat gambar unggahan.
  const handleFile = (file: File | undefined) => {
    setUploadError(null);
    setSaveError(null);
    setSaved(false);
    if (!file) return;
    const okType = ["image/jpeg", "image/jpg", "image/png"].includes(file.type);
    if (!okType) {
      setUploadError("Only JPG, JPEG, or PNG images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image exceeds the 5 MB limit.");
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
    boxesRef.current = [];
    clearCanvas();
    onDetections?.(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [clearCanvas, onDetections]);

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

  // Saat gambar termuat: catat dimensi native lalu jalankan pratinjau deteksi.
  const onImageLoad = async () => {
    const img = document.querySelector<HTMLImageElement>("#analyzer-upload-img");
    if (!img || !imageFile) return;
    srcDimRef.current = { w: img.naturalWidth, h: img.naturalHeight };
    requestAnimationFrame(() => renderDetections());
    setPreviewing(true);
    try {
      await runDetection(imageFile, img.naturalWidth, img.naturalHeight);
    } catch {
      // Pratinjau gagal → biarkan gambar tanpa kotak; user tetap bisa Save.
    } finally {
      setPreviewing(false);
    }
  };

  // Simpan inspeksi + analisa lengkap (tersimpan ke DB).
  const saveAndAnalyze = async () => {
    if (!imageFile) return;
    if (!location.trim()) {
      setSaveError("Location is required.");
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const form = new FormData();
      form.append("location", location.trim());
      if (area.trim()) form.append("area", area.trim());
      form.append("image", imageFile, imageFile.name);

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

      const analyzed = await api.post<{
        hazards: {
          yolo_label: string;
          risk_level: string;
          confidence_score: number;
        }[];
      }>(`/inspections/${created.data.inspection_id}/analyze`);

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
      setSaved(true);
    } catch {
      setSaveError("Something went wrong while analyzing. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Redraw saat ukuran window berubah (agar kotak tetap selaras).
  useEffect(() => {
    const onResize = () => {
      if (status === "live" || imageSrc) renderDetections();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [status, imageSrc, renderDetections]);

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
            {mode === "camera" ? "Live Camera Feed" : "Image Analysis"}
          </h2>
          <p className="text-xs text-muted">
            Real-time PPE &amp; hazard detection
          </p>
        </div>
        <div className="flex items-center gap-3">
          {mode === "camera" && <StatusPill status={status} />}
          <div className="flex rounded-lg bg-foreground/5 p-1">
            <TabButton
              active={mode === "camera"}
              onClick={() => switchMode("camera")}
              icon={Video}
              label="Live Camera"
            />
            <TabButton
              active={mode === "upload"}
              onClick={() => switchMode("upload")}
              icon={ImageUp}
              label="Upload Image"
            />
          </div>
        </div>
      </div>

      {/* Wadah 16:9 — video/gambar + canvas overlay ditumpuk */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      >
        {/* Video (mode kamera) */}
        {mode === "camera" && (
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 size-full object-cover"
          />
        )}

        {/* Gambar unggahan (mode upload) — ukuran wadah yang sama persis */}
        {mode === "upload" && imageSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            id="analyzer-upload-img"
            src={imageSrc}
            alt="Uploaded for analysis"
            onLoad={onImageLoad}
            className="absolute inset-0 size-full object-cover"
          />
        )}

        {/* Canvas transparan untuk bounding box */}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 size-full"
        />

        {/* Indikator sedang mendeteksi (pratinjau upload) */}
        {mode === "upload" && previewing && (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <ScanLine className="size-3.5 animate-pulse" />
            Detecting...
          </div>
        )}

        {/* Placeholder mode kamera (mati/error) */}
        {mode === "camera" && !isLive && status !== "loading" && (
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
        {mode === "camera" && status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-white/70" />
          </div>
        )}

        {/* Drop-zone mode upload (belum ada gambar) */}
        {mode === "upload" && !imageSrc && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "absolute inset-0 m-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center transition-colors",
              dragging
                ? "border-brand bg-brand/10"
                : "border-white/25 hover:border-white/50"
            )}
          >
            <UploadCloud
              className={cn(
                "size-9",
                dragging ? "text-brand" : "text-white/50"
              )}
              strokeWidth={1.5}
            />
            <p className="text-sm font-medium text-white/80">
              Click or drag an image here
            </p>
            <p className="text-xs text-white/40">JPG, JPEG or PNG · max 5 MB</p>
          </div>
        )}

        {/* Tombol hapus gambar */}
        {mode === "upload" && imageSrc && (
          <button
            type="button"
            onClick={clearImage}
            aria-label="Remove image"
            className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
          >
            <X className="size-4" />
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/jpg"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {/* Pesan error upload */}
      {mode === "upload" && uploadError && (
        <p className="mt-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
          {uploadError}
        </p>
      )}

      {/* Form simpan & analisa (mode upload, gambar sudah dipilih) */}
      {mode === "upload" && imageSrc && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Location <span className="text-brand">*</span>
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Assembly Line A"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted/60 focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Area <span className="text-muted/60">(optional)</span>
              </label>
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Zone 3"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted/60 focus:border-brand"
              />
            </div>
          </div>
          {saveError && (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
              {saveError}
            </p>
          )}
          {saved && (
            <p className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-500">
              <CheckCircle2 className="size-4" />
              Inspection saved and analyzed. See it in Reports.
            </p>
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
              {imageSrc ? "Replace Image" : "Choose Image"}
            </button>
            <button
              type="button"
              onClick={saveAndAnalyze}
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
