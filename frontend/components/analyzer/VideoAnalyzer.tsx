"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Video, Upload, X, Loader2, Play, Pause, CheckCircle2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { getClientToken } from "@/lib/auth";
import type { DetectionBox, DetectionSummary } from "./HazardResultPanel";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://safetyhazard-backend-production.up.railway.app";

// ── Area config ───────────────────────────────────────────
const AREAS = [
  { value: "spray_decoration",  label: "Spray/Decoration Area",  ppe: "Safety Glasses, Safety Gloves, Apron" },
  { value: "central_staging",   label: "Central Staging Area",   ppe: "Safety Helmet, Safety Boots" },
  { value: "assembly",          label: "Assembly Area",          ppe: "Trolley & pedestrian lane compliance" },
] as const;

type Detection = {
  label: string;
  confidence_score: number;
  bbox: { x1: number; y1: number; x2: number; y2: number; width: number; height: number };
  is_violation: boolean;
};

type AnalyzeFrameResponse = {
  detections: Detection[];
  frame_width?: number;
  frame_height?: number;
  risk_score: number;
  risk_band: string;
  compliance: DetectionSummary;
};

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

export function VideoAnalyzer({
  onDetections,
  onSummary,
  area: areaProp,
  onAreaChange,
}: {
  onDetections?: (d: DetectionBox[] | undefined) => void;
  onSummary?: (s: DetectionSummary | undefined) => void;
  area?: string;
  onAreaChange?: (area: string) => void;
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef  = useRef<NodeJS.Timeout | null>(null);
  const analyzeRef   = useRef<() => Promise<void>>(() => Promise.resolve());

  const [localArea, setLocalArea]     = useState("spray_decoration");
  const area = areaProp ?? localArea;

  const [videoSrc, setVideoSrc]       = useState<string | null>(null);
  const [videoFile, setVideoFile]     = useState<File | null>(null);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [dragActive, setDragActive]   = useState(false);
  const [saved, setSaved]             = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError]       = useState<string | null>(null);
  const [frameCount, setFrameCount]   = useState(0);

  const handleAreaChange = (val: string) => {
    setLocalArea(val);
    onAreaChange?.(val);
  };

  // ── Draw bounding boxes ───────────────────────────────
  const drawDetections = useCallback((
    detections: Detection[],
    frameWidth?: number,
    frameHeight?: number
  ) => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Wait for video dimensions to be available
    if (!video.videoWidth || !video.videoHeight) return;

    // Set canvas size to match video's natural dimensions
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach((det) => {
      // Normalize bbox: support both object {x1,y1,x2,y2} and legacy array [x1,y1,x2,y2]
      let bx1: number, by1: number, bx2: number, by2: number;
      if (Array.isArray(det.bbox)) {
        [bx1, by1, bx2, by2] = det.bbox;
      } else {
        bx1 = det.bbox.x1; by1 = det.bbox.y1; bx2 = det.bbox.x2; by2 = det.bbox.y2;
      }

      // Scale YOLO coords (in analysis-frame resolution) to canvas size.
      // YOLO bbox coords are in the resized analysis frame (max 1280px),
      // so scale to full video resolution.
      const scaleX = frameWidth ? canvas.width / frameWidth : 1;
      const scaleY = frameHeight ? canvas.height / frameHeight : 1;

      const px1 = bx1 * scaleX;
      const py1 = by1 * scaleY;
      const pw  = (bx2 - bx1) * scaleX;
      const ph  = (by2 - by1) * scaleY;

      const color = det.is_violation
        ? "#EF4444"
        : CLASS_COLORS[det.label] ?? "rgba(200, 200, 200, 0.9)";
      const label = `${det.label} ${Math.round(det.confidence_score * 100)}%`;

      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.strokeRect(px1, py1, pw, ph);

      ctx.font = "bold 13px Inter, sans-serif";
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle  = color;
      ctx.fillRect(px1, Math.max(0, py1 - 24), textWidth + 12, 24);
      ctx.fillStyle  = "white";
      ctx.fillText(label, px1 + 6, Math.max(16, py1 - 7));
    });
  }, []);

  // ── Send frame to backend ─────────────────────────────
  const analyzeFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !inspectionId || video.paused || video.ended) return;

    try {
      const offscreen = document.createElement("canvas");
      offscreen.width  = video.videoWidth;
      offscreen.height = video.videoHeight;
      const ctx = offscreen.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        offscreen.toBlob((b) => resolve(b), "image/jpeg", 0.85);
      });
      if (!blob) return;

      const formData = new FormData();
      formData.append("image", blob, "frame.jpg");
      formData.append("area", area);

      const response = await api.post<AnalyzeFrameResponse>(
        `/inspections/${inspectionId}/analyze-frame`,
        formData
      );

      if (response.ok && response.data) {
        const boxes: DetectionBox[] = response.data.detections.map((d) => {
          const bb = Array.isArray(d.bbox)
            ? d.bbox
            : [d.bbox.x1, d.bbox.y1, d.bbox.x2, d.bbox.y2];
          return {
            label:      d.label,
            confidence: d.confidence_score,
            danger:     d.is_violation,
            bbox:       bb as [number, number, number, number],
          };
        });
        onDetections?.(boxes);
        onSummary?.(response.data.compliance);
        drawDetections(response.data.detections, response.data.frame_width, response.data.frame_height);
        setFrameCount((n) => n + 1);
      }
    } catch (err) {
      console.error("Frame analysis error:", err);
    }
  }, [inspectionId, area, onDetections, onSummary, drawDetections]);

  // Update analyzeRef whenever analyzeFrame changes
  useEffect(() => {
    analyzeRef.current = analyzeFrame;
  }, [analyzeFrame]);

  // ── Handle file upload ────────────────────────────────
  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    const validTypes = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
    if (!validTypes.includes(file.type)) {
      setError("Invalid video format. Please upload MP4, WebM, or MOV.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Video file too large. Maximum 100MB.");
      return;
    }

    setError(null);
    setSaved(false);
    setPdfError(null);
    setFrameCount(0);
    setVideoFile(file);
    const videoUrl = URL.createObjectURL(file);
    setVideoSrc(videoUrl);

    try {
      const tempVideo = document.createElement("video");
      tempVideo.src   = videoUrl;
      tempVideo.muted = true;

      await new Promise<void>((resolve, reject) => {
        tempVideo.onloadedmetadata = () => resolve();
        tempVideo.onerror = () => reject(new Error("Failed to load video"));
        setTimeout(() => reject(new Error("Timeout")), 10000);
      });

      tempVideo.currentTime = 0;
      await new Promise<void>((resolve) => {
        tempVideo.onseeked = () => resolve();
        setTimeout(resolve, 2000);
      });

      const canvas = document.createElement("canvas");
      canvas.width  = tempVideo.videoWidth  || 1280;
      canvas.height = tempVideo.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      ctx.drawImage(tempVideo, 0, 0);

      const frameBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
      });
      if (!frameBlob) throw new Error("Failed to extract frame");

      const formData = new FormData();
      formData.append("location", AREAS.find(a => a.value === area)?.label ?? "Video Analysis");
      formData.append("area", area);
      formData.append("image", frameBlob, "first_frame.jpg");

      const result = await api.post<{ inspection_id: string }>("/inspections/", formData);
      if (result.ok && result.data) {
        setInspectionId(result.data.inspection_id);
      } else {
        throw new Error("Failed to create inspection");
      }
    } catch (err) {
      setError("Failed to prepare video: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  // ── Play / Pause ──────────────────────────────────────
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setIsPlaying(true); }
    else              { video.pause(); setIsPlaying(false); }
  };

  // ── Start analysis — auto-play + interval ─────────────
  const startAnalysis = () => {
    const video = videoRef.current;
    if (!video) return;

    // Auto-play video
    video.play();
    setIsPlaying(true);
    setIsAnalyzing(true);
    setSaved(false);

    // Analyze immediately then every 2 seconds
    analyzeRef.current();
    intervalRef.current = setInterval(() => analyzeRef.current(), 2000);
  };

  // ── Stop analysis ─────────────────────────────────────
  const stopAnalysis = () => {
    setIsAnalyzing(false);
    setSaved(true);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // ── Generate PDF ──────────────────────────────────────
  const generatePdf = async () => {
    if (!inspectionId) return;
    setPdfError(null);
    setGeneratingPdf(true);
    try {
      const gen = await api.post<{ report_id: string }>(`/reports/generate/${inspectionId}`);
      if (!gen.ok || !gen.data?.report_id) {
        setPdfError((gen.data as { detail?: string })?.detail || "Failed to generate report.");
        return;
      }
      const res = await fetch(`${BASE_URL}/reports/${gen.data.report_id}/download`, {
        headers: { Authorization: `Bearer ${getClientToken() ?? ""}` },
      });
      if (!res.ok) { setPdfError("Download failed."); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `report_${inspectionId}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { setPdfError("Something went wrong generating the PDF."); }
    finally  { setGeneratingPdf(false); }
  };

  // ── Clear video ───────────────────────────────────────
  const clearVideo = () => {
    stopAnalysis();
    setIsAnalyzing(false);
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoSrc(null);
    setVideoFile(null);
    setInspectionId(null);
    setIsPlaying(false);
    setSaved(false);
    setFrameCount(0);
    setPdfError(null);
    if (videoRef.current) videoRef.current.pause();
    onDetections?.(undefined);
    onSummary?.(undefined);
  };

  // ── Cleanup on unmount ────────────────────────────────
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
  }, [videoSrc]);

  const areaInfo = AREAS.find(a => a.value === area);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Video Analysis</h2>
          <p className="text-xs text-muted">Upload video for PPE &amp; hazard detection</p>
        </div>
        <Video className="size-5 text-brand" />
      </div>

      {/* Area Selector */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-muted">
          Area <span className="text-brand">*</span>
        </label>
        <select
          value={area}
          onChange={(e) => handleAreaChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand disabled:opacity-60"
        >
          {AREAS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        {areaInfo && (
          <p className="mt-1 text-xs text-muted">
            Required PPE: <span className="font-medium text-foreground">{areaInfo.ppe}</span>
          </p>
        )}
      </div>

      {/* Video container with canvas overlay */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      >
        {videoSrc ? (
          <>
            <video
              ref={videoRef}
              src={videoSrc}
              loop
              className="absolute inset-0 size-full object-contain"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 size-full object-contain"
            />
            {/* Analyzing indicator */}
            {isAnalyzing && (
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                Analyzing every 2s
              </div>
            )}
            <button
              onClick={clearVideo}
              className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
            >
              <X className="size-4" />
            </button>
          </>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFile(e.dataTransfer.files[0]); }}
            className={cn(
              "absolute inset-0 m-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors",
              dragActive ? "border-brand bg-brand/10" : "border-white/25 hover:border-white/50"
            )}
          >
            <Upload className={cn("size-10", dragActive ? "text-brand" : "text-white/50")} />
            <p className="text-sm font-medium text-white/80">Click or drag video here</p>
            <p className="text-xs text-white/40">MP4, MOV, WebM • Max 100MB</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{error}</p>
      )}

      {/* Generate PDF Report - show after first successful detection */}
      {frameCount > 0 && inspectionId && (
        <div className="mt-3 space-y-2 rounded-lg bg-green-500/10 px-3 py-3">
          <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-500">
            <CheckCircle2 className="size-4" />
            {saved 
              ? `Analysis complete — ${frameCount} frames analyzed. See it in Reports.`
              : `${frameCount} frame${frameCount > 1 ? 's' : ''} analyzed so far...`
            }
          </p>
          {pdfError && <p className="text-xs text-brand">{pdfError}</p>}
          <button
            onClick={generatePdf}
            disabled={generatingPdf}
            className={cn(
              "flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {generatingPdf ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            {generatingPdf ? "Generating PDF..." : "Generate PDF Report"}
          </button>
        </div>
      )}

      {/* Controls */}
      {videoSrc && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={togglePlay}
            className="flex items-center gap-2 rounded-lg bg-foreground/10 px-4 py-2 text-sm font-semibold transition-colors hover:bg-foreground/20"
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            onClick={isAnalyzing ? stopAnalysis : startAnalysis}
            disabled={!inspectionId}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
              isAnalyzing ? "bg-amber-600 hover:bg-amber-700" : "bg-brand hover:bg-brand-600",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {isAnalyzing ? (
              <><Loader2 className="size-4 animate-spin" /> Stop Analysis</>
            ) : (
              "Start Analysis"
            )}
          </button>
        </div>
      )}
    </div>
  );
}