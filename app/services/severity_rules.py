from datetime import date, timedelta

# ── Severity lookup table ──────────────────────────────────
# YOLO Johana cuma detect KEBERADAAN objek (helmet, safety_vest, dst),
# bukan KETIADAANNYA. Jadi hazard "no_helmet"/"no_safety_vest" itu
# hasil INFERENSI di ai_pipeline.py (person terdeteksi TAPI helmet
# tidak ada di daftar deteksi) — bukan label mentah dari YOLO.
SEVERITY_TABLE = {
    "chemical_spill":  {"risk_level": "critical", "priority": "high",   "due_days": 1},
    "exposed_cable":   {"risk_level": "critical", "priority": "high",   "due_days": 1},
    "wet_floor":       {"risk_level": "high",     "priority": "high",   "due_days": 3},
    "blocked_walkway": {"risk_level": "high",     "priority": "high",   "due_days": 3},
    "no_helmet":       {"risk_level": "medium",   "priority": "medium", "due_days": 7},
    "no_safety_vest":  {"risk_level": "medium",   "priority": "medium", "due_days": 7},
}

# Fallback kalau label tidak dikenali
DEFAULT_SEVERITY = {"risk_level": "medium", "priority": "medium", "due_days": 7}


def get_severity(yolo_label: str, confidence_score: float = 1.0) -> dict:
    """
    Ambil risk_level, priority, dan due_date berdasarkan YOLO label.
    Kalau confidence_score < 0.5, naikkan satu level kehati-hatian.
    """
    rule = SEVERITY_TABLE.get(yolo_label.lower(), DEFAULT_SEVERITY)

    risk_level = rule["risk_level"]
    priority   = rule["priority"]
    due_days   = rule["due_days"]

    # Kalau confidence rendah, treat lebih serius
    if confidence_score < 0.5 and yolo_label.lower() in SEVERITY_TABLE:
        if priority == "low":
            priority = "medium"
        elif priority == "medium":
            priority = "high"
        due_days = max(1, due_days - 2)

    due_date = date.today() + timedelta(days=due_days)

    return {
        "risk_level": risk_level,
        "priority":   priority,
        "due_date":   due_date,
    }


# ── Risk scoring ───────────────────────────────────────────
# Bobot per tingkat risiko. Dipakai untuk menggabung SEMUA hazard (PPE +
# lingkungan) jadi satu skor agregat, bukan sekadar Missing/Present biner.
RISK_WEIGHTS = {"critical": 10, "high": 6, "medium": 3, "low": 1}

# Ambang band skor. Diurut dari tertinggi; band pertama yang <= skor dipakai.
RISK_BANDS = [
    (24, "critical"),
    (12, "high"),
    (5,  "moderate"),
    (1,  "low"),
    (0,  "safe"),
]

# Confidence dilantai di nilai ini supaya deteksi ber-confidence rendah tetap
# menyumbang bobot (deteksi ragu tetap risiko), tidak dikalikan mendekati nol.
_MIN_CONFIDENCE_FACTOR = 0.5


def risk_score_band(score: float) -> str:
    """Petakan skor numerik ke band kategorikal (safe/low/moderate/high/critical)."""
    for threshold, band in RISK_BANDS:
        if score >= threshold:
            return band
    return "safe"


def compute_risk_score(hazards) -> dict:
    """
    Hitung skor risiko agregat dari daftar hazard.

    Tiap hazard menyumbang: RISK_WEIGHTS[risk_level] × max(confidence, 0.5).
    `hazards` = list dict; tiap item minimal punya "risk_level" dan salah satu
    dari "confidence"/"confidence_score". Aman terhadap key hilang / list kosong.

    Return: {"score": float (dibulatkan 1 desimal), "band": str,
             "contributions": [{"label","risk_level","confidence","points"}]}.
    """
    contributions = []
    total = 0.0

    if isinstance(hazards, (list, tuple)):
        for h in hazards:
            if not isinstance(h, dict):
                continue
            risk_level = str(h.get("risk_level", "medium")).lower()
            weight = RISK_WEIGHTS.get(risk_level, RISK_WEIGHTS["medium"])

            confidence = h.get("confidence")
            if confidence is None:
                confidence = h.get("confidence_score")
            try:
                confidence = float(confidence)
            except (TypeError, ValueError):
                confidence = 1.0
            # Lantai + plafon supaya faktor selalu di rentang wajar.
            factor = max(_MIN_CONFIDENCE_FACTOR, min(1.0, confidence))

            points = weight * factor
            total += points
            contributions.append({
                "label":      h.get("label") or h.get("yolo_label") or "",
                "risk_level": risk_level,
                "confidence": round(confidence, 2),
                "points":     round(points, 1),
            })

    score = round(total, 1)
    return {
        "score":         score,
        "band":          risk_score_band(score),
        "contributions": contributions,
    }
