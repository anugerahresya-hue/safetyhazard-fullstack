"""
area_rules.py — PPE compliance rules per Mattel facility area.

Dipakai oleh ai_pipeline.py dan inspections.py untuk menentukan
hazard apa yang perlu di-generate berdasarkan area inspeksi dan
label yang dideteksi YOLO v2.0.0.

YOLO v2.0.0 classes:
    person, trolley, phone, apron,
    safety_glasses, safety_gloves, safety_boots, safety_helmet
"""

from __future__ import annotations
from datetime import datetime, timedelta

# ── Area configuration ──────────────────────────────────────────────────────
AREA_CONFIG: dict[str, dict] = {
    "spray_decoration": {
        "display_name": "Spray/Decoration Area",
        "required_ppe": ["safety_glasses", "safety_gloves", "apron"],
        "violation_labels": {
            "safety_glasses": "no_glasses",
            "safety_gloves":  "no_gloves",
            "apron":          "no_apron",
        },
    },
    "central_staging": {
        "display_name": "Central Staging Area",
        "required_ppe": ["safety_helmet", "safety_boots"],
        "violation_labels": {
            "safety_helmet": "no_helmet",
            "safety_boots":  "no_safety_shoes",
        },
    },
    "assembly": {
        "display_name": "Assembly Area",
        "required_ppe": [],
        "violation_labels": {},
    },
    "general": {
        "display_name": "General",
        "required_ppe": [],
        "violation_labels": {},
    },
}

# Normalise incoming area strings from the frontend
_AREA_ALIAS: dict[str, str] = {
    # exact keys
    "spray_decoration": "spray_decoration",
    "central_staging":  "central_staging",
    "assembly":         "assembly",
    "general":          "general",
    # display-name variants (what the frontend may send)
    "Spray/Decoration Area":  "spray_decoration",
    "Central Staging Area":   "central_staging",
    "Assembly Area":          "assembly",
    "General":                "general",
}

# Risk levels for inferred violations
VIOLATION_RISK: dict[str, str] = {
    "no_glasses":      "high",
    "no_gloves":       "high",
    "no_apron":        "medium",
    "no_helmet":       "high",
    "no_safety_shoes": "high",
    "phone_while_walking":    "medium",
    "trolley_out_of_lane":    "high",
    "person_out_of_lane":     "medium",
}

# Lane boundaries (fraction of image width) used for Assembly Area
LANE_START: float = 0.2
LANE_END:   float = 0.8


# ── Public helpers ──────────────────────────────────────────────────────────

def get_area_config(area: str) -> dict:
    """Return config dict for the given area string (normalised)."""
    key = _AREA_ALIAS.get(area, "general")
    return AREA_CONFIG.get(key, AREA_CONFIG["general"])


def _make_violation(label: str, bbox: list | None = None, confidence: float = 0.90,
                    inferred: bool = True) -> dict:
    return {
        "label":          label,
        "yolo_label":     label,
        "confidence_score": confidence,
        "bbox":           bbox or [],
        "risk_level":     VIOLATION_RISK.get(label, "medium"),
        "inferred":       inferred,
    }


def check_ppe_compliance(
    detected_labels: set[str],
    area: str,
    person_count: int,
) -> list[dict]:
    """
    Return a list of missing-PPE violation dicts based on which PPE labels
    YOLO did NOT detect in the current frame.

    Parameters
    ----------
    detected_labels : set of lowercased label strings from YOLO detections
    area            : raw area string from the frontend / DB
    person_count    : number of persons detected (violations only generated
                      when at least one person is present)
    """
    if person_count == 0:
        return []

    config = get_area_config(area)
    violations: list[dict] = []

    for ppe_class, violation_label in config["violation_labels"].items():
        if ppe_class.lower() not in detected_labels:
            # Generate one violation entry per missing PPE class.
            # We don't do per-person bbox matching here because
            # `detected_labels` is already a set — per-person matching
            # is handled inside infer_ppe_violations() in inspections.py
            # when full bbox data is available.
            violations.append(_make_violation(violation_label))

    return violations


def check_special_hazards(detections: list[dict], area: str) -> list[dict]:
    """
    Detect special hazards that require spatial or behavioural logic:
      - phone_while_walking  (General area: phone detected + person present)
      - trolley_out_of_lane  (Assembly area: trolley centre outside lane)
      - person_out_of_lane   (Assembly area: person centre outside lane)

    Parameters
    ----------
    detections : list of raw YOLO detection dicts
                 Each dict: {"label": str, "confidence_score": float, "bbox": [x1,y1,x2,y2]}
    area       : raw area string
    """
    key = _AREA_ALIAS.get(area, "general")
    hazards: list[dict] = []

    labels_present = {d.get("label", "").lower() for d in detections}

    if key == "general":
        # phone_while_walking: any phone detected when a person is also present
        if "phone" in labels_present and "person" in labels_present:
            for d in detections:
                if d.get("label", "").lower() == "phone":
                    hazards.append(_make_violation(
                        "phone_while_walking",
                        bbox=d.get("bbox", []),
                        confidence=float(d.get("confidence_score", 0.90)),
                        inferred=False,
                    ))

    elif key == "assembly":
        for d in detections:
            label = d.get("label", "").lower()
            bbox  = d.get("bbox", [])
            if label not in ("trolley", "person") or len(bbox) < 4:
                continue

            x1, _y1, x2, _y2 = bbox
            centre_x_fraction = (x1 + x2) / 2  # assumes bbox in pixel coords;
            # if YOLO returns normalised [0-1] coords this is already correct.
            # For pixel coords we'd need image width — use a safe heuristic:
            # treat bbox values > 1 as pixel coords → normalise by 640 default.
            if centre_x_fraction > 1:
                centre_x_fraction = centre_x_fraction / 640.0

            out_of_lane = (
                centre_x_fraction < LANE_START or centre_x_fraction > LANE_END
            )
            if out_of_lane:
                violation_label = (
                    "trolley_out_of_lane" if label == "trolley" else "person_out_of_lane"
                )
                hazards.append(_make_violation(
                    violation_label,
                    bbox=bbox,
                    confidence=float(d.get("confidence_score", 0.90)),
                    inferred=False,
                ))

    return hazards