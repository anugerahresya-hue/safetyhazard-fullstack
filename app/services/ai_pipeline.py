import os
import httpx
from app.services.severity_rules import get_severity

YOLO_SERVICE_URL = os.getenv("YOLO_SERVICE_URL", "http://localhost:8000")
RAG_SERVICE_URL  = os.getenv("RAG_SERVICE_URL",  "http://localhost:8080")


# Confidence threshold default untuk YOLO. Diturunkan dari default service
# (0.25) supaya objek kecil (helmet/vest dari jauh) tidak gampang terlewat —
# hasil uji: pada 0.25 sebuah helmet ke-skip, muncul di ambang lebih rendah.
YOLO_CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.20"))
# Ukuran slice SAHI (pixel). Lebih kecil = lebih sensitif ke objek kecil.
YOLO_SLICE_SIZE = int(os.getenv("YOLO_SLICE_SIZE", "320"))


async def call_yolo_bytes(image_bytes: bytes, confidence: float = YOLO_CONFIDENCE) -> list:
    """Deteksi dari bytes gambar langsung (tanpa download URL).

    Selalu pakai /detect-sahi — endpoint SAHI memotong gambar jadi slice kecil
    sehingga jauh lebih akurat mendeteksi objek kecil (helmet, vest, person
    jauh) dibanding /detect standar. Dipakai baik oleh live-preview maupun
    analisa penuh supaya keduanya konsisten & akurat.
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        files = {"image": ("image.jpg", image_bytes, "image/jpeg")}
        response = await client.post(
            f"{YOLO_SERVICE_URL}/detect-sahi",
            files=files,
            params={"confidence": confidence, "slice_size": YOLO_SLICE_SIZE},
        )
        response.raise_for_status()
        return response.json().get("detections", [])


async def call_yolo(image_url: str, confidence: float = YOLO_CONFIDENCE) -> list:
    async with httpx.AsyncClient(timeout=60.0) as client:
        img_res = await client.get(image_url)
        img_res.raise_for_status()
        image_bytes = img_res.content
    return await call_yolo_bytes(image_bytes, confidence)


async def call_ocr(image_url: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            img_res = await client.get(image_url)
            img_res.raise_for_status()
            files = {"image": ("image.jpg", img_res.content, "image/jpeg")}
            response = await client.post(f"{YOLO_SERVICE_URL}/ocr", files=files)
            response.raise_for_status()
            return response.json().get("ocr_text", "")
    except Exception:
        # OCR opsional — kalau gagal, lanjut tanpa OCR
        return ""


async def call_rag(hazards: list) -> list:
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{RAG_SERVICE_URL}/rag/generate-corrective-actions",
            json={"hazards": hazards}
        )
        response.raise_for_status()
        # Nisrina confirmed actual response shape: {"actions": [{"label": ..., "action_description": ...}]}
        return response.json().get("actions", [])


ENV_HAZARD_LABELS = {"wet_floor", "blocked_walkway", "exposed_cable", "chemical_spill"}


async def run_full_pipeline(image_url: str) -> list:
    # 1. YOLO detection (pakai SAHI)
    detections = await call_yolo(image_url)

    if not detections:
        return []

    detected_labels = {d.get("label", "").lower() for d in detections}
    person_detections = [d for d in detections if d.get("label", "").lower() == "person"]

    # a) Hazard lingkungan — setiap deteksi LANGSUNG jadi hazard
    hazard_detections = [
        d for d in detections if d.get("label", "").lower() in ENV_HAZARD_LABELS
    ]

    # b) Hazard PPE — YOLO cuma detect KEBERADAAN helmet/safety_vest 
    if person_detections:
        person_confidence = max(d.get("confidence_score", 1.0) for d in person_detections)
        if "helmet" not in detected_labels:
            hazard_detections.append({"label": "no_helmet", "confidence_score": person_confidence})
        if "safety_vest" not in detected_labels:
            hazard_detections.append({"label": "no_safety_vest", "confidence_score": person_confidence})

    if not hazard_detections:
        return []  # tidak ada hazard lingkungan, dan PPE lengkap → area aman

    
    ocr_text = ""

    # 3. RAG — kirim semua hazard sekaligus (batch)
    hazard_inputs = [
        {
            "label":            d.get("label"),
            "confidence_score": d.get("confidence_score"),
            "ocr_text":         ocr_text,
        }
        for d in hazard_detections
    ]

    try:
        rag_results = await call_rag(hazard_inputs)
    except Exception:
        # Kalau RAG gagal, tetap lanjut dengan default action
        rag_results = []

    # 4. Gabungkan dengan severity rules
    rag_map = {r["label"]: r for r in rag_results}
    hazards = []

    for detection in hazard_detections:
        label      = detection.get("label")
        confidence = detection.get("confidence_score", 1.0)
        severity   = get_severity(label, confidence)
        rag        = rag_map.get(label, {})

        hazards.append({
            "yolo_label":       label,
            "category":         label.replace("_", " ").title(),
            "confidence_score": confidence,
            "risk_level":       severity["risk_level"],
            "ocr_text":         ocr_text,
            "corrective_action": {
                "action_description": rag.get("action_description", "Refer to EHSS guidelines"),
                "priority":           severity["priority"],
                "due_date":           severity["due_date"],
            }
        })

    return hazards