from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
import uuid
import os
import httpx
from supabase import create_client
from app.database import get_db
from app.middleware.auth import get_current_user, inspector_only, manager_or_admin
from app.models.user import User
from app.models.inspection import Inspection
from app.models.hazard import Hazard
from app.models.corrective_action import CorrectiveAction
from app.services.ai_pipeline import call_yolo, call_yolo_bytes, call_rag, ENV_HAZARD_LABELS, run_full_pipeline
from app.services.severity_rules import get_severity, compute_risk_score


# ── Geometry & PPE inference helpers ───────────────────────────────
def bbox_to_list(bbox):
    """
    Normalisasi bbox ke list [x1, y1, x2, y2].

    YOLO Johana mengembalikan bbox sebagai DICT
    {"x1","y1","x2","y2","width","height"}, tapi sebagian kode/legacy
    memakai list [x1,y1,x2,y2]. Terima kedua bentuk; kembalikan [] untuk
    input yang tidak valid (None, dict tanpa key, list < 4 elemen, dst)
    supaya pemanggil bisa memutuskan sendiri. TIDAK PERNAH raise.
    """
    if isinstance(bbox, dict):
        try:
            return [
                float(bbox["x1"]), float(bbox["y1"]),
                float(bbox["x2"]), float(bbox["y2"]),
            ]
        except (KeyError, TypeError, ValueError):
            return []
    if isinstance(bbox, (list, tuple)):
        if len(bbox) < 4:
            return []
        try:
            return [float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])]
        except (TypeError, ValueError):
            return []
    return []


def compute_iou(box_a, box_b):
    """
    Hitung Intersection-over-Union dua bbox. Menerima bentuk list
    [x1, y1, x2, y2] MAUPUN dict {"x1","y1","x2","y2"} (dinormalisasi
    lewat bbox_to_list). Defensif: box kosong / kurang dari 4 elemen /
    zero-area → kembalikan 0.0. TIDAK PERNAH raise.
    """
    a = bbox_to_list(box_a)
    b = bbox_to_list(box_b)
    if not a or not b:
        return 0.0

    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b

    # Normalisasi supaya (x1,y1) pojok kiri-atas, (x2,y2) pojok kanan-bawah
    ax1, ax2 = min(ax1, ax2), max(ax1, ax2)
    ay1, ay2 = min(ay1, ay2), max(ay1, ay2)
    bx1, bx2 = min(bx1, bx2), max(bx1, bx2)
    by1, by2 = min(by1, by2), max(by1, by2)

    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    if area_a <= 0 or area_b <= 0:  # box zero-area → IoU tidak bermakna
        return 0.0

    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)

    union = area_a + area_b - inter
    if union <= 0:  # guard ZeroDivisionError
        return 0.0

    return inter / union


def infer_ppe_violations(detections, area=""):
    """
    Inferensi pelanggaran PPE per-orang dari deteksi mentah YOLO v2.0.0.
    
    YOLO v2.0.0 classes: person, trolley, phone, apron, safety_glasses,
    safety_gloves, safety_boots, safety_helmet
    
    Area-specific PPE requirements:
    - Spray/Decoration: safety_glasses, safety_gloves, apron
    - Central Staging: safety_helmet, safety_boots
    - Assembly: lane violations (trolley & person)
    - General/All: phone_while_walking
    """
    # YOLO v2.0.0 class names
    PPE_CLASSES = {"person", "safety_helmet", "safety_glasses", "safety_gloves", 
                   "safety_boots", "apron", "trolley", "phone"}
    
    RISK_MAP = {
        "blocked_walkway":   "high",
        "wet_floor":         "medium",
        "exposed_cable":     "high",
        "fire_hazard":       "critical",
        "spill":             "medium",
        "missing_guardrail": "critical",
    }
    
    PPE_IOU_THRESHOLD = 0.05  # For helmet, glasses, gloves, boots vs person top-half
    APRON_IOU_THRESHOLD = 0.10  # For apron vs person full bbox
    LANE_START = 0.2  # Lane boundary start (20% from left)
    LANE_END = 0.8    # Lane boundary end (80% from left)
    
    if not isinstance(detections, (list, tuple)) or not detections:
        return []
    
    # Separate detections by class
    persons = []
    helmets = []
    glasses = []
    gloves = []
    boots = []
    aprons = []
    trolleys = []
    phones = []
    other_hazards = []
    
    for det in detections:
        if not isinstance(det, dict):
            continue
        label = str(det.get("label", "")).lower()
        
        if label == "person":
            persons.append(det)
        elif label == "safety_helmet":
            helmets.append(det)
        elif label == "safety_glasses":
            glasses.append(det)
        elif label == "safety_gloves":
            gloves.append(det)
        elif label == "safety_boots":
            boots.append(det)
        elif label == "apron":
            aprons.append(det)
        elif label == "trolley":
            trolleys.append(det)
        elif label == "phone":
            phones.append(det)
        elif label not in PPE_CLASSES:
            # Other hazards (environmental, etc.)
            hazard = dict(det)
            hazard["risk_level"] = RISK_MAP.get(label, "medium")
            other_hazards.append(hazard)
    
    output = other_hazards.copy()
    
    # Area-specific PPE inference
    area_lower = area.lower() if area else ""
    
    for person in persons:
        person_bbox = bbox_to_list(person.get("bbox"))
        if not person_bbox:
            continue
        
        px1, py1, px2, py2 = person_bbox
        y_top, y_bot = min(py1, py2), max(py1, py2)
        x_left, x_right = min(px1, px2), max(px1, px2)
        
        # Top half for helmet, glasses, gloves, boots
        top_half = [x_left, y_top, x_right, y_top + (y_bot - y_top) / 2.0]
        
        # Spray/Decoration Area: glasses, gloves, apron
        if "spray" in area_lower or "decoration" in area_lower:
            wearing_glasses = any(
                compute_iou(g.get("bbox", []), top_half) >= PPE_IOU_THRESHOLD
                for g in glasses
            )
            wearing_gloves = any(
                compute_iou(g.get("bbox", []), top_half) >= PPE_IOU_THRESHOLD
                for g in gloves
            )
            wearing_apron = any(
                compute_iou(a.get("bbox", []), person_bbox) >= APRON_IOU_THRESHOLD
                for a in aprons
            )
            
            if not wearing_glasses:
                output.append({
                    "label": "no_safety_glasses",
                    "yolo_label": "no_safety_glasses",
                    "confidence": 0.90,
                    "bbox": person_bbox,
                    "risk_level": "high",
                    "inferred": True,
                })
            if not wearing_gloves:
                output.append({
                    "label": "no_safety_gloves",
                    "yolo_label": "no_safety_gloves",
                    "confidence": 0.90,
                    "bbox": person_bbox,
                    "risk_level": "high",
                    "inferred": True,
                })
            if not wearing_apron:
                output.append({
                    "label": "no_apron",
                    "yolo_label": "no_apron",
                    "confidence": 0.90,
                    "bbox": person_bbox,
                    "risk_level": "high",
                    "inferred": True,
                })
        
        # Central Staging Area: helmet, safety_boots
        elif "central" in area_lower or "staging" in area_lower:
            wearing_helmet = any(
                compute_iou(h.get("bbox", []), top_half) >= PPE_IOU_THRESHOLD
                for h in helmets
            )
            wearing_boots = any(
                compute_iou(b.get("bbox", []), top_half) >= PPE_IOU_THRESHOLD
                for b in boots
            )
            
            if not wearing_helmet:
                output.append({
                    "label": "no_safety_helmet",
                    "yolo_label": "no_safety_helmet",
                    "confidence": 0.90,
                    "bbox": person_bbox,
                    "risk_level": "high",
                    "inferred": True,
                })
            if not wearing_boots:
                output.append({
                    "label": "no_safety_boots",
                    "yolo_label": "no_safety_boots",
                    "confidence": 0.90,
                    "bbox": person_bbox,
                    "risk_level": "high",
                    "inferred": True,
                })
        
        # Assembly Area: check person lane violations
        elif "assembly" in area_lower:
            # Person should stay in side lanes (< 20% or > 80%)
            center_x = (x_left + x_right) / 2.0
            # Assume image width from bbox bounds (rough estimate)
            image_width = max(px2, x_right, 1.0)
            if LANE_START < (center_x / image_width) < LANE_END:
                output.append({
                    "label": "person_out_of_lane",
                    "yolo_label": "person_out_of_lane",
                    "confidence": person.get("confidence_score", 0.90),
                    "bbox": person_bbox,
                    "risk_level": "high",
                    "inferred": False,
                })
    
    # Assembly Area: trolley lane violations
    if "assembly" in area_lower:
        for trolley in trolleys:
            trolley_bbox = bbox_to_list(trolley.get("bbox"))
            if not trolley_bbox:
                continue
            
            tx1, ty1, tx2, ty2 = trolley_bbox
            center_x = (tx1 + tx2) / 2.0
            image_width = max(tx2, 1.0)
            
            # Trolley should stay in center lane (20%-80%)
            if (center_x / image_width) < LANE_START or (center_x / image_width) > LANE_END:
                output.append({
                    "label": "trolley_out_of_lane",
                    "yolo_label": "trolley_out_of_lane",
                    "confidence": trolley.get("confidence_score", 0.90),
                    "bbox": trolley_bbox,
                    "risk_level": "high",
                    "inferred": False,
                })
    
    # Universal: phone_while_walking (all areas)
    if phones and persons:
        for phone in phones:
            output.append({
                "label": "phone_while_walking",
                "yolo_label": "phone_while_walking",
                "confidence": phone.get("confidence_score", 0.90),
                "bbox": bbox_to_list(phone.get("bbox", [])),
                "risk_level": "medium",
                "inferred": False,
            })
    
    return output


def detection_summary(detections, enriched_hazards=None):
    """
    Ringkasan untuk panel status frontend + skor risiko agregat.

    `detections`      = deteksi MENTAH YOLO v2.0.0 (buat hitung jumlah orang/PPE items).
    `enriched_hazards`= hasil infer_ppe_violations (pelanggaran PPE per-orang +
                        hazard lingkungan dengan risk_level). Dipakai untuk
                        breakdown per-pekerja & skor risiko.
    """
    # YOLO v2.0.0 class names
    HELMET_LABELS = {"safety_helmet"}
    GLASSES_LABELS = {"safety_glasses"}
    GLOVES_LABELS = {"safety_gloves"}
    BOOTS_LABELS = {"safety_boots"}
    APRON_LABELS = {"apron"}

    person = helmet = glasses = gloves = boots = apron = 0
    if isinstance(detections, (list, tuple)):
        for d in detections:
            if not isinstance(d, dict):
                continue
            label = str(d.get("label", "")).lower()
            if label == "person":
                person += 1
            elif label in HELMET_LABELS:
                helmet += 1
            elif label in GLASSES_LABELS:
                glasses += 1
            elif label in GLOVES_LABELS:
                gloves += 1
            elif label in BOOTS_LABELS:
                boots += 1
            elif label in APRON_LABELS:
                apron += 1

    # Breakdown pelanggaran per-orang + hazard lingkungan dari enriched_hazards.
    missing_helmet = 0
    missing_glasses = 0
    missing_gloves = 0
    missing_boots = 0
    missing_apron = 0
    env = set()
    if isinstance(enriched_hazards, (list, tuple)):
        for h in enriched_hazards:
            if not isinstance(h, dict):
                continue
            label = str(h.get("label") or h.get("yolo_label") or "").lower()
            if label == "no_safety_helmet":
                missing_helmet += 1
            elif label == "no_safety_glasses":
                missing_glasses += 1
            elif label == "no_safety_gloves":
                missing_gloves += 1
            elif label == "no_safety_boots":
                missing_boots += 1
            elif label == "no_apron":
                missing_apron += 1
            elif label in ENV_HAZARD_LABELS:
                env.add(label)

    risk = compute_risk_score(enriched_hazards or [])

    return {
        "person_count":        person,
        "helmet_count":        helmet,
        "glasses_count":       glasses,
        "gloves_count":        gloves,
        "boots_count":         boots,
        "apron_count":         apron,
        "vest_count":          0,  # Deprecated in YOLO v2.0.0
        "has_person":          person > 0,
        # Berapa orang yang APD-nya tidak terpakai (hasil inferensi spasial).
        "workers_missing_helmet": missing_helmet,
        "workers_missing_glasses": missing_glasses,
        "workers_missing_gloves": missing_gloves,
        "workers_missing_boots": missing_boots,
        "workers_missing_apron": missing_apron,
        "workers_missing_vest":   0,  # Deprecated
        "env_hazards":         sorted(env),
        "risk_score":          risk["score"],
        "risk_band":           risk["band"],
    }
        "env_hazards":         sorted(env),
        "risk_score":          risk["score"],
        "risk_band":           risk["band"],
    }


router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# ── POST /inspections ──────────────────────────────────────
@router.post("/", status_code=201)
async def create_inspection(
    location: str = Form(...),
    area: Optional[str] = Form(None),
    image: UploadFile = File(...),
    current_user: User = Depends(inspector_only),
    db: Session = Depends(get_db)
):
    # Upload image ke Supabase Storage pakai supabase-py client
    # (bukan httpx manual — key format baru Supabase tidak selalu
    # bisa dipakai langsung di header Authorization: Bearer)
    image_bytes = await image.read()
    filename = f"{uuid.uuid4()}_{image.filename}"

    supabase = get_supabase()
    try:
        supabase.storage.from_("inspections").upload(
            path=filename,
            file=image_bytes,
            file_options={"content-type": image.content_type or "image/jpeg", "upsert": "true"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")

    image_url = f"{SUPABASE_URL}/storage/v1/object/public/inspections/{filename}"

    # Simpan inspection ke DB
    inspection = Inspection(
        user_id=current_user.id,
        location=location,
        area=area,
        image_url=image_url,
        status="pending"
    )
    db.add(inspection)
    db.commit()
    db.refresh(inspection)

    return {
        "inspection_id": str(inspection.id),
        "image_url": image_url,
        "status": inspection.status
    }


# ── POST /inspections/{id}/analyze ────────────────────────
@router.post("/{inspection_id}/analyze")
async def analyze_inspection(
    inspection_id: str,
    current_user: User = Depends(inspector_only),
    db: Session = Depends(get_db)
):
    # Cek inspection ada
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.user_id == current_user.id
    ).first()

    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    if not inspection.image_url:
        raise HTTPException(status_code=400, detail="No image found for this inspection")

    # Gunakan run_full_pipeline yang sudah diupdate dengan area-based detection
    area = inspection.area or "spray_decoration"
    try:
        raw_detections, enriched_hazards = await run_full_pipeline(inspection.image_url, area)
    except httpx.HTTPStatusError as e:
        # YOLO/RAG service HTTP error dengan detail lebih jelas
        service_name = "YOLO" if "detect" in str(e.request.url) else "RAG"
        raise HTTPException(
            status_code=502,
            detail=f"{service_name} service unavailable (HTTP {e.response.status_code}). The AI detection service is temporarily down. Please try again in a few moments."
        )
    except httpx.RequestError as e:
        # Network error (timeout, connection refused, etc)
        raise HTTPException(
            status_code=502,
            detail=f"Cannot connect to AI detection service. Please check if the YOLO service is running or try again later."
        )
    except Exception as e:
        # Unexpected error
        raise HTTPException(
            status_code=502,
            detail=f"AI analysis failed: {str(e)}"
        )

    # Simpan hazards + corrective actions dari enriched_hazards
    hazard_list = []
    for h in enriched_hazards:
        label      = h.get("yolo_label", "")
        confidence = h.get("confidence_score", 1.0)
        risk_level = h.get("risk_level", "medium")
        ocr_text   = h.get("ocr_text", "")
        
        corrective = h.get("corrective_action", {})
        action_description = corrective.get("action_description", "Refer to EHSS guidelines")
        priority = corrective.get("priority", "medium")
        due_date = corrective.get("due_date")

        hazard = Hazard(
            inspection_id=inspection.id,
            category=label.replace("_", " ").title(),
            risk_level=risk_level,
            confidence_score=confidence,
            yolo_label=label,
            ocr_text=ocr_text,
            description=action_description
        )
        db.add(hazard)
        db.flush()

        action = CorrectiveAction(
            hazard_id=hazard.id,
            action_description=action_description,
            priority=priority,
            due_date=due_date,
            action_status="open"
        )
        db.add(action)

        hazard_list.append({
            "hazard_id": str(hazard.id),
            "category": hazard.category,
            "risk_level": hazard.risk_level,
            "confidence_score": hazard.confidence_score,
            "yolo_label": hazard.yolo_label,
            "corrective_action": {
                "action_description": action.action_description,
                "priority": action.priority,
                "due_date": str(action.due_date),
            }
        })

    # Update inspection status
    inspection.status = "analyzed"
    db.commit()

    return {
        "inspection_id": str(inspection.id),
        "status": "analyzed",
        "hazards": hazard_list,
        "summary": detection_summary(raw_detections, enriched_hazards),
    }


def build_preview_boxes(detections, area=""):
    """
    Ubah deteksi mentah YOLO menjadi kotak siap-gambar untuk frontend.

    - Hazard lingkungan + pelanggaran PPE hasil inferensi (area-specific) → danger=True (merah).
    - Deteksi mentah person/PPE items TIDAK ikut (difilter oleh
      infer_ppe_violations), jadi overlay hanya menampilkan yang BENAR-BENAR
      hazard. Kalau tidak ada hazard → list kosong (box hilang).

    Setiap kotak: {label, confidence, danger, bbox:[x1,y1,x2,y2]}.
    bbox dinormalisasi ke list; kotak tanpa bbox valid dibuang (tak bisa
    digambar).
    """
    enriched = infer_ppe_violations(detections, area)
    boxes = []
    for d in enriched:
        bbox = bbox_to_list(d.get("bbox"))
        if not bbox:
            continue
        label = d.get("label") or d.get("yolo_label") or ""
        confidence = d.get("confidence")
        if confidence is None:
            confidence = d.get("confidence_score", 0.0)
        boxes.append({
            "label":      label.replace("_", " "),
            "confidence": confidence,
            "danger":     True,  # infer_ppe_violations hanya keluarkan hazard
            "bbox":       bbox,
        })
    return boxes


@router.post("/live-preview")
async def live_preview(
    image: UploadFile = File(...),
    area: str = Form("spray_decoration"),
    current_user: User = Depends(inspector_only),
):
    from app.services.area_rules import check_ppe_compliance, check_special_hazards, get_area_config
    
    image_bytes = await image.read()

    # Deteksi langsung dari bytes lewat /detect-sahi (sama seperti analisa
    # penuh). Sebelumnya live-preview meng-upload frame ke Supabase lalu
    # memanggil /detect standar — itu lebih lambat DAN kurang akurat (objek
    # kecil seperti helmet/vest sering terlewat, sehingga panel salah lapor
    # "Present/Clear"). SAHI + bytes langsung menghilangkan dua masalah itu.
    try:
        raw_detections = await call_yolo_bytes(image_bytes)
    except Exception:
        raw_detections = []

    # Area-based PPE detection menggunakan dataset baru
    detected_labels = {d.get("label", "").lower() for d in raw_detections}
    person_detections = [d for d in raw_detections if d.get("label", "").lower() == "person"]
    person_count = len(person_detections)
    
    # Gabungkan environmental hazards + missing PPE + special hazards
    enriched = []
    
    # Environmental hazards
    for d in raw_detections:
        if d.get("label", "").lower() in ENV_HAZARD_LABELS:
            enriched.append(d)
    
    # PPE violations (area-based)
    if person_count > 0:
        missing_ppe = check_ppe_compliance(detected_labels, area, person_count)
        enriched.extend(missing_ppe)
    
    # Special hazards (phone usage, lane violations)
    special_hazards = check_special_hazards(raw_detections, area)
    enriched.extend(special_hazards)

    # Kembalikan kotak yang sudah dienrich (hazard + inferensi PPE) supaya
    # frontend tinggal menggambar; box hanya muncul saat ada hazard nyata.
    # `summary` memberi tahu panel apakah ada orang di frame + breakdown PPE
    # per-pekerja + risk score gabungan.
    return {
        "detections": build_preview_boxes(raw_detections, area),
        "summary": detection_summary(raw_detections, enriched),
        "area_info": {
            "area": area,
            "display_name": get_area_config(area)["display_name"],
            "required_ppe": get_area_config(area)["required_ppe"]
        }
    }
@router.get("/")
def list_inspections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Allow all authenticated users to view their own inspections"""
    # Inspector sees only their own, manager/admin see all
    if current_user.role == "inspector":
        inspections = db.query(Inspection).filter(
            Inspection.user_id == current_user.id
        ).order_by(Inspection.created_at.desc()).all()
    else:
        inspections = db.query(Inspection).order_by(Inspection.created_at.desc()).all()

    return [
        {
            "id": str(i.id),
            "location": i.location,
            "area": i.area,
            "image_url": i.image_url,
            "status": i.status,
            "inspected_at": str(i.inspected_at),
        }
        for i in inspections
    ]


# ── GET /inspections/{id} ──────────────────────────────────
@router.get("/{inspection_id}")
def get_inspection(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(
        Inspection.id == inspection_id
    ).first()

    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    # Inspector hanya bisa lihat milik sendiri
    if current_user.role == "inspector" and str(inspection.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")

    hazards = db.query(Hazard).filter(Hazard.inspection_id == inspection.id).all()
    hazard_list = []

    for h in hazards:
        actions = db.query(CorrectiveAction).filter(
            CorrectiveAction.hazard_id == h.id
        ).all()
        hazard_list.append({
            "id": str(h.id),
            "category": h.category,
            "risk_level": h.risk_level,
            "confidence_score": h.confidence_score,
            "yolo_label": h.yolo_label,
            "ocr_text": h.ocr_text,
            "corrective_actions": [
                {
                    "id": str(a.id),
                    "action_description": a.action_description,
                    "priority": a.priority,
                    "due_date": str(a.due_date),
                    "action_status": a.action_status,
                }
                for a in actions
            ]
        })

    return {
        "id": str(inspection.id),
        "location": inspection.location,
        "area": inspection.area,
        "image_url": inspection.image_url,
        "status": inspection.status,
        "inspected_at": str(inspection.inspected_at),
        "hazards": hazard_list
    }
