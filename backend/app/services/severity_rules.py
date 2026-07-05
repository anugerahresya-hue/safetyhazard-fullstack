from datetime import date, timedelta

# ── Severity lookup table ──────────────────────────────────
# Berdasarkan 7 kelas hazard dari YOLO Johana
# Priority dan due_date ditentukan rule-based, bukan oleh AI

SEVERITY_TABLE = {
    "chemical_spill":  {"risk_level": "critical", "priority": "high",   "due_days": 1},
    "exposed_cable":   {"risk_level": "critical", "priority": "high",   "due_days": 1},
    "wet_floor":       {"risk_level": "high",     "priority": "high",   "due_days": 3},
    "blocked_walkway": {"risk_level": "high",     "priority": "high",   "due_days": 3},
    "helmet":          {"risk_level": "medium",   "priority": "medium", "due_days": 7},
    "safety_vest":     {"risk_level": "medium",   "priority": "medium", "due_days": 7},
    "person":          {"risk_level": "low",      "priority": "low",    "due_days": 14},
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
