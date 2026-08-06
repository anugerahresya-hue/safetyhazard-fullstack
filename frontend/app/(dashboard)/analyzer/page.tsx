"use client";

import { useState } from "react";
import { CameraCapture } from "@/components/analyzer/CameraCapture";
import { VideoAnalyzer } from "@/components/analyzer/VideoAnalyzer";
import {
  HazardResultPanel,
  type DetectionBox,
  type DetectionSummary,
} from "@/components/analyzer/HazardResultPanel";
import { useLang } from "@/contexts/LanguageContext";

export default function AnalyzerPage() {
  const { t } = useLang();
  const [detections, setDetections] = useState<DetectionBox[] | null>(null);
  const [summary, setSummary] = useState<DetectionSummary | null>(null);
  const [area, setArea] = useState<string>("spray_decoration");
  const [activeTab, setActiveTab] = useState<"live" | "video">("live");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t.analyzer.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.analyzer.subtitle}</p>
      </div>

      {/* Tab Switcher */}
      <div className="mb-4 flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("live")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "live"
              ? "border-b-2 border-primary text-primary"
              : "text-muted hover:text-foreground"
          }`}
        >
          Live Camera
        </button>
        <button
          onClick={() => setActiveTab("video")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "video"
              ? "border-b-2 border-primary text-primary"
              : "text-muted hover:text-foreground"
          }`}
        >
          Upload Video
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {activeTab === "live" ? (
            <CameraCapture
              onDetections={setDetections}
              onSummary={setSummary}
              onAreaChange={setArea}
            />
          ) : (
            <VideoAnalyzer
              area={area}
              onAreaChange={setArea}
              onDetections={(d) => setDetections(d ?? null)}
              onSummary={(s) => setSummary(s ?? null)}
            />
          )}
        </div>
        <div className="lg:col-span-4">
          <HazardResultPanel
            detections={detections}
            summary={summary}
            area={area}
          />
        </div>
      </div>
    </div>
  );
}
