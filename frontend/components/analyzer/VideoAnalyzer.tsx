"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Video, Upload, X, Loader2, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { DetectionBox, DetectionSummary } from "./HazardResultPanel";

type Detection = {
  label: string;
  confidence_score: number;
  bbox: { x: number; y: number; width: number; height: number };
  is_violation: boolean;
};

type AnalyzeFrameResponse = {
  detections: Detection[];
  risk_score: number;
  risk_band: string;
  compliance: DetectionSummary;
};

export function VideoAnalyzer({
  onDetections,
  onSummary,
  area,
}: {
  onDetections?: (d: DetectionBox[]) => void;
  onSummary?: (s: DetectionSummary) => void;
  area: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Draw bounding boxes on canvas
  const drawDetections = useCallback((detections: Detection[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas size to video display size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach((det) => {
      const color = det.is_violation ? "#EF4444" : "#22C55E"; // Red or Green
      const { x, y, width, height } = det.bbox;

      // Draw rectangle
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // Draw label background
      const label = `${det.label} ${Math.round(det.confidence_score * 100)}%`;
      ctx.font = "bold 14px Inter, sans-serif";
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 26, textWidth + 12, 26);

      // Draw label text
      ctx.fillStyle = "white";
      ctx.fillText(label, x + 6, y - 8);
    });
  }, []);

  // Extract frame and send to backend
  const analyzeFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !inspectionId || !videoFile) return;

    try {
      // Create canvas to extract frame
      const offscreen = document.createElement("canvas");
      offscreen.width = video.videoWidth;
      offscreen.height = video.videoHeight;
      const ctx = offscreen.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

      // Convert to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        offscreen.toBlob((b) => resolve(b), "image/jpeg", 0.85);
      });

      if (!blob) return;

      // Send to backend
      const formData = new FormData();
      formData.append("image", blob, "frame.jpg");
      formData.append("area", area);

      const response = await api.post<AnalyzeFrameResponse>(
        `/inspections/${inspectionId}/analyze-frame`,
        formData
      );

      if (response.ok && response.data) {
        // Convert to DetectionBox format for panel
        const boxes: DetectionBox[] = response.data.detections.map((d) => ({
          label: d.label,
          confidence: d.confidence_score,
          danger: d.is_violation,
          bbox: [d.bbox.x, d.bbox.y, d.bbox.x + d.bbox.width, d.bbox.y + d.bbox.height],
        }));

        onDetections?.(boxes);
        onSummary?.(response.data.compliance);

        // Draw bounding boxes
        drawDetections(response.data.detections);
      }
    } catch (err) {
      console.error("Frame analysis error:", err);
    }
  }, [inspectionId, videoFile, area, onDetections, onSummary, drawDetections]);

  // Handle video file upload
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
    setVideoFile(file);
    setVideoSrc(URL.createObjectURL(file));

    // Create inspection
    try {
      const formData = new FormData();
      formData.append("location", "Video Analysis");
      formData.append("area", area);
      formData.append("image", file);

      const result = await api.post<{ inspection_id: string }>(
        "/inspections/",
        formData
      );

      if (result.ok && result.data) {
        setInspectionId(result.data.inspection_id);
      }
    } catch (err) {
      setError("Failed to create inspection");
    }
  };

  // Video play/pause
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  // Start analyzing (frame extraction every 3 seconds)
  const startAnalysis = () => {
    setIsAnalyzing(true);
    analyzeFrame(); // First frame immediately

    intervalRef.current = setInterval(() => {
      analyzeFrame();
    }, 3000);
  };

  // Stop analyzing
  const stopAnalysis = () => {
    setIsAnalyzing(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Clear video
  const clearVideo = () => {
    stopAnalysis();
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoSrc(null);
    setVideoFile(null);
    setInspectionId(null);
    setIsPlaying(false);
    if (videoRef.current) videoRef.current.pause();
    onDetections?.(null);
    onSummary?.(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAnalysis();
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
  }, [videoSrc]);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Video Analysis</h2>
          <p className="text-xs text-muted">Upload video for PPE & hazard detection</p>
        </div>
        <div className="flex items-center gap-2">
          <Video className="size-5 text-brand" />
        </div>
      </div>

      {/* Video Container with Canvas Overlay */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      >
        {videoSrc ? (
          <>
            <video
              ref={videoRef}
              src={videoSrc}
              className="absolute inset-0 size-full object-contain"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 size-full object-contain"
            />
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
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleFile(e.dataTransfer.files[0]);
            }}
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
              <>
                <Loader2 className="size-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              "Start Analysis"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
