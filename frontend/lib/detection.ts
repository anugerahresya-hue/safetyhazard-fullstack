/**
 * Client-side object detection untuk real-time PPE & hazard detection.
 * Menggunakan TensorFlow.js COCO-SSD model (ringan, cepat, runs in browser).
 */

import * as cocoSsd from "@tensorflow-models/coco-ssd";
import "@tensorflow/tfjs";

export type Detection = {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
};

// EHSS-specific classes yang kita track
export type EhssClass =
  | "person"
  | "helmet"
  | "vest"
  | "phone"
  | "no_helmet"
  | "no_vest";

// Color mapping untuk EHSS hazards (merah = danger)
export const EHSS_CLASS_COLOR: Record<EhssClass, string> = {
  person: "#3B82F6", // blue - context
  helmet: "#10B981", // green - safe
  vest: "#10B981", // green - safe
  phone: "#C8102E", // red - hazard
  no_helmet: "#C8102E", // red - violation
  no_vest: "#C8102E", // red - violation
};

// Label display untuk EHSS classes
export const EHSS_CLASS_LABEL: Record<EhssClass, string> = {
  person: "Person",
  helmet: "Helmet",
  vest: "Safety Vest",
  phone: "Phone",
  no_helmet: "No Helmet",
  no_vest: "No Vest",
};

// Color untuk context objects (COCO classes yang bukan EHSS priority)
export const COCO_CONTEXT_COLOR = "#6B7280"; // gray

let model: cocoSsd.ObjectDetection | null = null;
let loading = false;

/**
 * Load model (panggil sekali di awal). Idempotent - aman dipanggil berkali-kali.
 */
export async function loadModel(): Promise<void> {
  if (model) return; // sudah loaded
  if (loading) {
    // wait for existing load
    while (loading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return;
  }
  loading = true;
  try {
    model = await cocoSsd.load({ base: "mobilenet_v2" });
  } finally {
    loading = false;
  }
}

/**
 * Run detection pada video/image element.
 * Returns array of detections dengan bbox dalam format [x, y, w, h].
 */
export async function detect(
  source: HTMLVideoElement | HTMLImageElement
): Promise<Detection[]> {
  if (!model) {
    await loadModel();
  }
  if (!model) return [];

  try {
    const predictions = await model.detect(source);
    return predictions.map((p) => ({
      class: p.class,
      score: p.score,
      bbox: p.bbox as [number, number, number, number],
    }));
  } catch {
    return [];
  }
}

/**
 * Infer PPE violations dari detections.
 * Logic: kalau ada person tapi tidak ada helmet/vest di vicinity → violation.
 * 
 * NOTES:
 * - COCO-SSD tidak detect helmet/vest (bukan COCO class), jadi kita hanya bisa
 *   detect person & phone untuk sekarang.
 * - Untuk full PPE detection, perlu custom YOLO model (seperti backend).
 * - Untuk demo client-side, kita detect person & phone saja.
 */
export function inferViolations(detections: Detection[]): Detection[] {
  const violations: Detection[] = [];
  
  // Untuk sekarang, kita hanya highlight phone usage sebagai violation
  // (COCO-SSD bisa detect "cell phone" class)
  const persons = detections.filter((d) => d.class === "person");
  const phones = detections.filter((d) => d.class === "cell phone");
  
  // Jika ada phone terdeteksi, mark sebagai hazard
  phones.forEach((phone) => {
    violations.push({
      class: "phone",
      score: phone.score,
      bbox: phone.bbox,
    });
  });
  
  return violations;
}

/**
 * Check apakah dua bbox overlap (simple IoU check).
 */
function computeIoU(
  box1: [number, number, number, number],
  box2: [number, number, number, number]
): number {
  const [x1, y1, w1, h1] = box1;
  const [x2, y2, w2, h2] = box2;

  const xLeft = Math.max(x1, x2);
  const yTop = Math.max(y1, y2);
  const xRight = Math.min(x1 + w1, x2 + w2);
  const yBottom = Math.min(y1 + h1, y2 + h2);

  if (xRight < xLeft || yBottom < yTop) return 0;

  const intersection = (xRight - xLeft) * (yBottom - yTop);
  const union = w1 * h1 + w2 * h2 - intersection;

  return union > 0 ? intersection / union : 0;
}
