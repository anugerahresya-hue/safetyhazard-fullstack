"use client";

import { useState } from "react";
import { CameraCapture } from "@/components/analyzer/CameraCapture";
import {
  HazardResultPanel,
  type DetectionBox,
} from "@/components/analyzer/HazardResultPanel";

/**
 * Hazard Analyzer (khusus Inspector) — kamera real-time / upload gambar di
 * kiri, panel hasil deteksi di kanan. State deteksi diangkat ke sini supaya
 * kotak yang digambar CameraCapture dan status di HazardResultPanel selalu
 * sinkron (keduanya sumber datanya sama: hasil backend).
 */
export default function AnalyzerPage() {
  // null = belum ada deteksi dijalankan; [] = sudah jalan, area aman.
  const [detections, setDetections] = useState<DetectionBox[] | null>(null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Hazard Analyzer</h1>
        <p className="mt-1 text-sm text-muted">
          Real-time PPE &amp; environmental hazard detection
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <CameraCapture onDetections={setDetections} />
        </div>
        <div className="lg:col-span-4">
          <HazardResultPanel detections={detections} />
        </div>
      </div>
    </div>
  );
}
