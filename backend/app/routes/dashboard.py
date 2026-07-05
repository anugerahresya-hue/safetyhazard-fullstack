from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.middleware.auth import manager_or_admin, get_current_user
from app.models.inspection import Inspection
from app.models.hazard import Hazard

router = APIRouter()


# ── GET /dashboard/stats ───────────────────────────────────
@router.get("/stats")
def get_stats(
    current_user=Depends(manager_or_admin),
    db: Session = Depends(get_db)
):
    total_inspections = db.query(Inspection).count()
    total_hazards = db.query(Hazard).count()

    # Risk distribution
    risk_dist = db.query(
        Hazard.risk_level,
        func.count(Hazard.id)
    ).group_by(Hazard.risk_level).all()

    # Hazard by category
    category_dist = db.query(
        Hazard.category,
        func.count(Hazard.id)
    ).group_by(Hazard.category).all()

    return {
        "total_inspections": total_inspections,
        "total_hazards": total_hazards,
        "risk_distribution": {r[0]: r[1] for r in risk_dist},
        "hazard_by_category": {c[0]: c[1] for c in category_dist},
    }


# ── GET /dashboard/inspections ─────────────────────────────
@router.get("/inspections")
def get_all_inspections(
    current_user=Depends(manager_or_admin),
    db: Session = Depends(get_db)
):
    inspections = db.query(Inspection).order_by(
        Inspection.created_at.desc()
    ).all()

    return [
        {
            "id": str(i.id),
            "user_id": str(i.user_id),
            "location": i.location,
            "area": i.area,
            "status": i.status,
            "inspected_at": str(i.inspected_at),
        }
        for i in inspections
    ]
