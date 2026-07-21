from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from app.database import get_db
from app.middleware.auth import manager_or_admin, get_current_user
from app.models.inspection import Inspection
from app.models.hazard import Hazard

router = APIRouter()

# Label PPE hasil inferensi (dipakai untuk KPI "PPE Violations" & bar chart).
_PPE_LABELS = {"no_helmet", "no_safety_vest", "no_gloves", "no_goggles", "no_boots"}


def _scoped_inspection_ids(db: Session, current_user):
    """
    ID inspeksi yang boleh dilihat user.
    Inspector → miliknya saja; manager/admin → semua (None = tanpa filter).
    """
    if current_user.role == "inspector":
        rows = db.query(Inspection.id).filter(
            Inspection.user_id == current_user.id
        ).all()
        return [r[0] for r in rows]
    return None  # None artinya "semua" (tanpa filter)


# ── GET /dashboard/stats ───────────────────────────────────
@router.get("/stats")
def get_stats(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Statistik dashboard dari data nyata (bukan dummy). Role-scoped:
    inspector hanya melihat inspeksi/hazard miliknya, manager/admin semua.
    """
    insp_ids = _scoped_inspection_ids(db, current_user)

    insp_q = db.query(Inspection)
    hazard_q = db.query(Hazard)
    if insp_ids is not None:
        # Inspector: batasi ke inspeksi miliknya. List kosong tetap aman
        # (in_([]) menghasilkan 0 baris).
        insp_q = insp_q.filter(Inspection.id.in_(insp_ids))
        hazard_q = hazard_q.filter(Hazard.inspection_id.in_(insp_ids))

    total_inspections = insp_q.count()
    total_hazards = hazard_q.count()

    analyzed_count = insp_q.filter(Inspection.status == "analyzed").count()
    reported_count = insp_q.filter(Inspection.status == "reported").count()

    # Risk distribution (untuk donut chart).
    risk_rows = (
        hazard_q.with_entities(Hazard.risk_level, func.count(Hazard.id))
        .group_by(Hazard.risk_level)
        .all()
    )
    risk_distribution = {r[0]: r[1] for r in risk_rows}

    # Hazard by category.
    cat_rows = (
        hazard_q.with_entities(Hazard.category, func.count(Hazard.id))
        .group_by(Hazard.category)
        .all()
    )
    hazard_by_category = {c[0]: c[1] for c in cat_rows}

    # KPI cards.
    critical_high = sum(
        v for k, v in risk_distribution.items() if k in ("critical", "high")
    )
    ppe_violations = (
        hazard_q.filter(Hazard.yolo_label.in_(_PPE_LABELS)).count()
    )

    # PPE deficiencies (bar chart) — hitung per label PPE.
    ppe_rows = (
        hazard_q.with_entities(Hazard.yolo_label, func.count(Hazard.id))
        .filter(Hazard.yolo_label.in_(_PPE_LABELS))
        .group_by(Hazard.yolo_label)
        .all()
    )
    ppe_deficiencies = [
        {"type": lbl.replace("_", " ").title(), "count": cnt}
        for lbl, cnt in ppe_rows
    ]

    # 7-day trend: hazard terdeteksi per hari (7 hari terakhir).
    today = date.today()
    start = today - timedelta(days=6)
    trend_rows = (
        hazard_q.with_entities(
            func.date(Hazard.created_at), func.count(Hazard.id)
        )
        .filter(func.date(Hazard.created_at) >= start)
        .group_by(func.date(Hazard.created_at))
        .all()
    )
    trend_map = {str(d): c for d, c in trend_rows}
    weekly_trend = []
    for i in range(7):
        day = start + timedelta(days=i)
        weekly_trend.append({
            "day": day.strftime("%a"),
            "date": str(day),
            "hazards": trend_map.get(str(day), 0),
        })

    # Recent activity: hazard terbaru dengan lokasi inspeksinya.
    recent_q = (
        db.query(Hazard, Inspection.location)
        .join(Inspection, Hazard.inspection_id == Inspection.id)
    )
    if insp_ids is not None:
        recent_q = recent_q.filter(Hazard.inspection_id.in_(insp_ids))
    recent_rows = recent_q.order_by(Hazard.created_at.desc()).limit(5).all()
    recent_activity = [
        {
            "text": f"{h.category} detected — {location or 'Unknown location'}",
            "risk_level": h.risk_level,
            "at": str(h.created_at),
        }
        for h, location in recent_rows
    ]

    return {
        "total_inspections": total_inspections,
        "total_hazards": total_hazards,
        "analyzed": analyzed_count,
        "reported": reported_count,
        "active_hazards": total_hazards,
        "critical_high": critical_high,
        "ppe_violations": ppe_violations,
        "risk_distribution": risk_distribution,
        "hazard_by_category": hazard_by_category,
        "ppe_deficiencies": ppe_deficiencies,
        "weekly_trend": weekly_trend,
        "recent_activity": recent_activity,
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
