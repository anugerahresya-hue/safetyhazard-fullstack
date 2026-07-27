import os
import httpx
from io import BytesIO
from PIL import Image
from app.services.severity_rules import get_severity
from app.services.area_rules import check_ppe_compliance, check_special_hazards

YOLO_SERVICE_URL = os.getenv("YOLO_SERVICE_URL", "http://localhost:8000")
RAG_SERVICE_URL  = os.getenv("RAG_SERVICE_URL",  "http://localhost:8080")


# Confidence threshold default untuk YOLO. Diupdate ke 0.25 (API minimum).
YOLO_CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.25"))
# Ukuran slice SAHI (pixel). Lebih kecil = lebih sensitif ke objek kecil.
YOLO_SLICE_SIZE = int(os.getenv("YOLO_SLICE_SIZE", "320"))
# Max dimension untuk resize image sebelum kirim ke YOLO (mengurangi beban CPU)
MAX_IMAGE_DIMENSION = int(os.getenv("MAX_IMAGE_DIMENSION", "1280"))


def resize_image_if_needed(image_bytes: bytes, max_dimension: int = MAX_IMAGE_DIMENSION) -> bytes:
    """
    Downscale image jika lebih besar dari max_dimension, maintain aspect ratio.
    YOLO service running di CPU, image besar + SAHI bisa timeout/OOM.
    """
    try:
        img = Image.open(BytesIO(image_bytes))
        
        # Convert RGBA to RGB if needed
        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
            img = background
        
        # If already small enough, return as-is
        if img.width <= max_dimension and img.height <= max_dimension:
            return image_bytes
        
        # Calculate new dimensions (maintain aspect ratio)
        ratio = min(max_dimension / img.width, max_dimension / img.height)
        new_width = int(img.width * ratio)
        new_height = int(img.height * ratio)
        
        # Resize using high-quality filter
        img = img.resize((new_width, new_height), Image.LANCZOS)
        
        # Convert back to bytes
        output = BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        return output.getvalue()
    except Exception:
        # If resize fails, return original
        return image_bytes


async def call_yolo_bytes(image_bytes: bytes, confidence: float = YOLO_CONFIDENCE) -> list:
    """Deteksi dari bytes gambar langsung — untuk live camera (frame per frame).

    Selalu pakai /detect-sahi karena live camera kirim per-frame (bukan video utuh).
    Retry logic: 500 errors bisa sementara (YOLO service restart/overload).
    Image resizing: Downscale ke 1280px untuk mengurangi beban CPU YOLO service.
    """
    # Kalau ternyata bytes-nya video (bukan frame), route ke detect-video
    if _is_video_bytes(image_bytes):
        print("[YOLO] call_yolo_bytes received video bytes — routing to /detect-video")
        return await call_yolo_video_bytes(image_bytes, confidence)

    # Resize image untuk mengurangi beban YOLO service (running di CPU)
    image_bytes = resize_image_if_needed(image_bytes)

    max_retries = 3
    retry_delay = 2  # seconds

    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                files = {"image": ("image.jpg", image_bytes, "image/jpeg")}
                response = await client.post(
                    f"{YOLO_SERVICE_URL}/detect-sahi",
                    files=files,
                    params={
                        "confidence": confidence,
                        "slice_size": YOLO_SLICE_SIZE,
                        "is_walking": True,
                        "lane_start": 0.2,
                        "lane_end":   0.8,
                    },
                )
                response.raise_for_status()
                return response.json().get("detections", [])
        except httpx.HTTPStatusError as e:
            if e.response.status_code >= 500 and attempt < max_retries - 1:
                import asyncio
                await asyncio.sleep(retry_delay)
                continue
            raise
        except httpx.RequestError:
            if attempt < max_retries - 1:
                import asyncio
                await asyncio.sleep(retry_delay)
                continue
            raise

    return []


async def call_yolo_video_bytes(video_bytes: bytes, confidence: float = YOLO_CONFIDENCE) -> list:
    """Kirim video bytes ke YOLO /detect-video endpoint.

    Params sesuai Swagger YOLO v2.0.0:
      video         : multipart field (MP4/AVI/MOV)
      confidence    : 0.25 default
      frame_interval: 30 (proses 1 frame per 30 frame)
      use_sahi      : false (lebih cepat untuk video)
      is_walking    : true
      lane_start    : 0.2
      lane_end      : 0.8
      max_frames    : 50
    """
    print(f"[YOLO] Sending {len(video_bytes)} bytes to /detect-video")
    async with httpx.AsyncClient(timeout=180.0) as client:
        files = {"video": ("video.mp4", video_bytes, "video/mp4")}
        response = await client.post(
            f"{YOLO_SERVICE_URL}/detect-video",
            files=files,
            params={
                "confidence":     confidence,
                "frame_interval": 30,
                "use_sahi":       False,
                "is_walking":     True,
                "lane_start":     0.2,
                "lane_end":       0.8,
                "max_frames":     50,
            },
        )
        response.raise_for_status()
        data = response.json()
        # /detect-video returns per-frame detections — flatten to single list
        # Response format: {"frames": [{"frame": N, "detections": [...]}, ...]}
        # or {"detections": [...]} for aggregated results
        if "detections" in data:
            return data["detections"]
        elif "frames" in data:
            # Flatten all frame detections into one list, deduplicated by label+bbox
            all_detections = []
            seen = set()
            for frame in data["frames"]:
                for det in frame.get("detections", []):
                    key = (det.get("label"), str(det.get("bbox", [])))
                    if key not in seen:
                        seen.add(key)
                        all_detections.append(det)
            return all_detections
        return []


VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm", ".mkv"}


def _is_video_url(url: str) -> bool:
    """Check if URL points to a video file by extension."""
    from pathlib import PurePosixPath
    path = PurePosixPath(url.split("?")[0])  # strip query params
    return path.suffix.lower() in VIDEO_EXTENSIONS


def _is_video_bytes(data: bytes) -> bool:
    """Check if bytes are a video by magic bytes signature."""
    if len(data) < 12:
        return False
    # MP4/MOV: ftyp box
    if data[4:8] in (b"ftyp", b"moov", b"mdat"):
        return True
    # AVI: RIFF....AVI
    if data[:4] == b"RIFF" and data[8:11] == b"AVI":
        return True
    # WebM/MKV: EBML header
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return True
    return False


async def call_yolo(image_url: str, confidence: float = YOLO_CONFIDENCE) -> list:
    """Download file dari URL lalu kirim ke YOLO endpoint yang sesuai.

    - Video (mp4/mov/avi)  → /detect-video  (field: video)
    - Gambar (jpg/png/etc) → /detect-sahi   (field: image)
    """
    async with httpx.AsyncClient(timeout=120.0) as client:
        file_res = await client.get(image_url)
        file_res.raise_for_status()
        file_bytes = file_res.content

    content_type = file_res.headers.get("content-type", "")
    print(f"[YOLO] Downloaded {len(file_bytes)} bytes, content-type: {content_type}, url: {image_url[-60:]}")

    # Guard: kalau dapat HTML (error page dari Supabase), jangan kirim ke YOLO
    if file_bytes[:15].lower().lstrip().startswith(b"<!doctype") or file_bytes[:6] == b"<html>":
        print("[YOLO] Got HTML response from Supabase — bucket may be private or file not found")
        return []

    # Route to correct YOLO endpoint
    is_video = (
        _is_video_url(image_url) or
        "video" in content_type or
        _is_video_bytes(file_bytes)
    )

    if is_video:
        print("[YOLO] Routing to /detect-video")
        return await call_yolo_video_bytes(file_bytes, confidence)
    else:
        print("[YOLO] Routing to /detect-sahi")
        return await call_yolo_bytes(file_bytes, confidence)


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


async def run_full_pipeline(image_url: str, area: str = "spray_decoration") -> tuple:
    """
    Return tuple: (raw_detections, enriched_hazards)
    - raw_detections: deteksi mentah dari YOLO (untuk summary stats)
    - enriched_hazards: hazard yang sudah diproses dengan RAG + severity
    """
    # 1. YOLO detection (pakai SAHI)
    detections = await call_yolo(image_url)

    if not detections:
        return ([], [])  # Return empty tuple

    detected_labels = {d.get("label", "").lower() for d in detections}
    person_detections = [d for d in detections if d.get("label", "").lower() == "person"]
    person_count = len(person_detections)

    # a) Hazard lingkungan — setiap deteksi LANGSUNG jadi hazard
    hazard_detections = [
        d for d in detections if d.get("label", "").lower() in ENV_HAZARD_LABELS
    ]

    # b) Hazard PPE — area-based detection menggunakan dataset baru
    # Dataset baru punya: person, trolley, phone, apron, safety_glasses, 
    # safety_gloves, safety_boots, safety_helmet (bukan "helmet"/"safety_vest" lagi)
    if person_count > 0:
        # Gunakan area_rules untuk cek PPE compliance per area
        missing_ppe = check_ppe_compliance(detected_labels, area, person_count)
        hazard_detections.extend(missing_ppe)
    
    # c) Special hazards (phone usage, trolley/person lane violations)
    special_hazards = check_special_hazards(detections, area)
    hazard_detections.extend(special_hazards)

    if not hazard_detections:
        return (detections, [])  # Ada deteksi tapi tidak ada hazard → area aman

    
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

    return (detections, hazards)  # Return tuple: (raw_detections, enriched_hazards)