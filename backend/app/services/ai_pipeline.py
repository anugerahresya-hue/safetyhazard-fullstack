import os
import httpx
from app.services.severity_rules import get_severity

YOLO_SERVICE_URL = os.getenv("YOLO_SERVICE_URL", "http://localhost:8001")
RAG_SERVICE_URL  = os.getenv("RAG_SERVICE_URL", "http://localhost:8002")


async def call_yolo(image_url: str) -> list:
    """
    Kirim image_url ke YOLO service Johana.
    Returns: list of { label, confidence_score, bounding_box }
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{YOLO_SERVICE_URL}/detect",
            json={"image_url": image_url}
        )
        response.raise_for_status()
        return response.json().get("detections", [])


async def call_ocr(image_url: str) -> str:
    """
    Kirim image_url ke OCR endpoint Johana.
    Returns: extracted text string
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{YOLO_SERVICE_URL}/ocr",
            json={"image_url": image_url}
        )
        response.raise_for_status()
        return response.json().get("ocr_text", "")


async def call_rag(hazards: list) -> list:
    """
    Kirim batch hazards ke RAG service Nisrina.
    Input:  [{ label, confidence_score, ocr_text }]
    Returns: [{ label, action_description }]
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{RAG_SERVICE_URL}/analyze",
            json={"hazards": hazards}
        )
        response.raise_for_status()
        return response.json().get("results", [])


async def run_full_pipeline(image_url: str) -> list:
    """
    Jalankan full AI pipeline:
    YOLO → OCR → RAG → apply severity rules
    Returns: list of hazard dicts siap disimpan ke DB
    """
    # 1. YOLO detection
    detections = await call_yolo(image_url)

    if not detections:
        return []

    # 2. OCR (satu kali untuk seluruh gambar)
    ocr_text = await call_ocr(image_url)

    # 3. RAG — kirim semua hazard sekaligus (batch)
    hazard_inputs = [
        {
            "label":            d.get("label"),
            "confidence_score": d.get("confidence_score"),
            "ocr_text":         ocr_text,
        }
        for d in detections
    ]
    rag_results = await call_rag(hazard_inputs)

    # 4. Gabungkan dengan severity rules
    rag_map = {r["label"]: r for r in rag_results}
    hazards = []

    for detection in detections:
        label      = detection.get("label")
        confidence = detection.get("confidence_score", 1.0)
        severity   = get_severity(label, confidence)
        rag        = rag_map.get(label, {})

        hazards.append({
            "yolo_label":          label,
            "category":            label.replace("_", " ").title(),
            "confidence_score":    confidence,
            "risk_level":          severity["risk_level"],
            "ocr_text":            ocr_text,
            "corrective_action": {
                "action_description": rag.get("action_description", "Refer to EHSS guidelines"),
                "priority":           severity["priority"],
                "due_date":           severity["due_date"],
            }
        })

    return hazards
