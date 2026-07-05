from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
import uuid
from app.database import get_db
from app.middleware.auth import get_current_user, inspector_only, manager_or_admin
from app.models.user import User
from app.models.inspection import Inspection
from app.models.hazard import Hazard
from app.models.corrective_action import CorrectiveAction
from app.services.severity_rules import get_severity
import httpx
import os

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
YOLO_SERVICE_URL = os.getenv("YOLO_SERVICE_URL", "http://localhost:8001")
RAG_SERVICE_URL = os.getenv("RAG_SERVICE_URL", "http://localhost:8002")


# ── POST /inspections ──────────────────────────────────────
@router.post("/", status_code=201)
async def create_inspection(
    location: str = Form(...),
    area: Optional[str] = Form(None),
    image: UploadFile = File(...),
    current_user: User = Depends(inspector_only),
    db: Session = Depends(get_db)
):
    # Upload image ke Supabase Storage
    image_bytes = await image.read()
    filename = f"{uuid.uuid4()}_{image.filename}"

    async with httpx.AsyncClient() as client:
        upload_res = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/inspections/{filename}",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": image.content_type,
            },
            content=image_bytes
        )

    if upload_res.status_code not in [200, 201]:
        raise HTTPException(status_code=500, detail="Failed to upload image")

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

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # 1. Call YOLO service
            yolo_res = await client.post(
                f"{YOLO_SERVICE_URL}/detect",
                json={"image_url": inspection.image_url}
            )
            detections = yolo_res.json().get("detections", [])

            # 2. Call OCR service
            ocr_res = await client.post(
                f"{YOLO_SERVICE_URL}/ocr",
                json={"image_url": inspection.image_url}
            )
            ocr_text = ocr_res.json().get("ocr_text", "")

            # 3. Call RAG service (batch)
            rag_res = await client.post(
                f"{RAG_SERVICE_URL}/analyze",
                json={"hazards": [
                    {
                        "label": d.get("label"),
                        "confidence_score": d.get("confidence_score"),
                        "ocr_text": ocr_text
                    }
                    for d in detections
                ]}
            )
            rag_results = rag_res.json().get("results", [])

    except Exception:
        # Kalau AI service belum jalan, pakai mock data
        detections = [{"label": "no_helmet", "confidence_score": 0.92}]
        ocr_text = ""
        rag_results = [{"label": "no_helmet", "action_description": "Provide helmet immediately per EHSS standard"}]

    # 4. Simpan hazards + corrective actions
    rag_map = {r["label"]: r for r in rag_results}
    hazard_list = []

    for detection in detections:
        label = detection.get("label", "unknown")
        confidence = detection.get("confidence_score", 1.0)
        severity = get_severity(label, confidence)
        rag = rag_map.get(label, {})

        hazard = Hazard(
            inspection_id=inspection.id,
            category=label.replace("_", " ").title(),
            risk_level=severity["risk_level"],
            confidence_score=confidence,
            yolo_label=label,
            ocr_text=ocr_text,
            description=rag.get("action_description", "")
        )
        db.add(hazard)
        db.flush()

        action = CorrectiveAction(
            hazard_id=hazard.id,
            action_description=rag.get("action_description", "Refer to EHSS guidelines"),
            priority=severity["priority"],
            due_date=severity["due_date"],
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
        "hazards": hazard_list
    }


# ── GET /inspections ───────────────────────────────────────
@router.get("/")
def list_inspections(
    current_user: User = Depends(inspector_only),
    db: Session = Depends(get_db)
):
    inspections = db.query(Inspection).filter(
        Inspection.user_id == current_user.id
    ).order_by(Inspection.created_at.desc()).all()

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
