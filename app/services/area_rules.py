"""
Area-specific PPE requirements dan hazard detection rules.

Setiap area punya requirement PPE berbeda. Pipeline AI akan memeriksa
apakah orang di area tersebut memakai PPE yang sesuai, dan juga memeriksa
hazard spesifik area (misal: trolley keluar jalur di Assembly Area).
"""

# ── Area definitions ───────────────────────────────────────
AREA_PPE_REQUIREMENTS = {
    "spray_decoration": {
        "display_name": "Spray/Decoration Area",
        "required_ppe": ["safety_glasses", "safety_gloves", "apron"],
        "optional_ppe": [],
        "description": "Area pengecatan dan dekorasi - wajib pakai kacamata, sarung tangan, dan apron"
    },
    "central_staging": {
        "display_name": "Central Staging Area",
        "required_ppe": ["safety_helmet", "safety_boots"],
        "optional_ppe": [],
        "description": "Area staging - wajib pakai helm dan sepatu safety"
    },
    "assembly": {
        "display_name": "Assembly Area",
        "required_ppe": [],
        "optional_ppe": ["safety_helmet", "safety_boots"],
        "description": "Area assembly - perhatikan jalur trolley dan pedestrian",
        "special_rules": ["trolley_lane_violation", "person_lane_violation"]
    },
    "general": {
        "display_name": "General/All Areas",
        "required_ppe": [],
        "optional_ppe": ["safety_helmet", "safety_boots", "safety_glasses", "safety_gloves"],
        "description": "Area umum - dilarang main HP sambil jalan",
        "special_rules": ["phone_usage"]
    },
}

# Default jika area tidak dipilih atau tidak valid
DEFAULT_AREA = "general"


def get_area_config(area_key: str) -> dict:
    """
    Ambil konfigurasi area berdasarkan key.
    Return konfigurasi area atau default jika tidak ditemukan.
    """
    return AREA_PPE_REQUIREMENTS.get(area_key, AREA_PPE_REQUIREMENTS[DEFAULT_AREA])


def get_required_ppe_for_area(area_key: str) -> list:
    """Return daftar PPE yang wajib dipakai di area tertentu."""
    config = get_area_config(area_key)
    return config.get("required_ppe", [])


def get_special_rules_for_area(area_key: str) -> list:
    """Return daftar special rules yang berlaku di area tertentu."""
    config = get_area_config(area_key)
    return config.get("special_rules", [])


def get_all_areas() -> dict:
    """Return semua area yang tersedia untuk dropdown UI."""
    return {
        key: {
            "display_name": config["display_name"],
            "description": config["description"]
        }
        for key, config in AREA_PPE_REQUIREMENTS.items()
    }


def check_ppe_compliance(detected_labels: set, area_key: str, person_count: int) -> list:
    """
    Periksa apakah PPE yang terdeteksi memenuhi requirement area.
    
    Args:
        detected_labels: Set label yang terdeteksi YOLO (misal: {"person", "safety_helmet", ...})
        area_key: Key area (misal: "spray_decoration")
        person_count: Jumlah orang yang terdeteksi
    
    Returns:
        List of missing PPE hazards dengan format:
        [{"label": "no_safety_helmet", "confidence_score": <person_conf>}, ...]
    """
    if person_count == 0:
        return []  # Tidak ada orang = tidak perlu cek PPE
    
    required_ppe = get_required_ppe_for_area(area_key)
    missing_ppe = []
    
    for ppe in required_ppe:
        if ppe not in detected_labels:
            # PPE wajib tidak ditemukan = hazard
            missing_label = f"no_{ppe}"
            missing_ppe.append({
                "label": missing_label,
                "confidence_score": 0.95,  # High confidence untuk missing PPE
                "reason": f"Required PPE '{ppe}' not detected in {get_area_config(area_key)['display_name']}"
            })
    
    return missing_ppe


def check_special_hazards(detections: list, area_key: str) -> list:
    """
    Periksa special hazards untuk area tertentu (phone usage, lane violations).
    
    Args:
        detections: List deteksi mentah dari YOLO
        area_key: Key area
    
    Returns:
        List of special hazards yang ditemukan
    """
    special_rules = get_special_rules_for_area(area_key)
    hazards = []
    
    detected_labels = {d.get("label", "").lower() for d in detections}
    
    # Rule 1: Phone usage (berlaku di area "general" dan bisa ditambah ke area lain)
    if "phone_usage" in special_rules:
        if "phone" in detected_labels and "person" in detected_labels:
            phone_det = next((d for d in detections if d.get("label", "").lower() == "phone"), None)
            if phone_det:
                hazards.append({
                    "label": "phone_usage_while_walking",
                    "confidence_score": phone_det.get("confidence_score", 0.8),
                    "reason": "Person detected using phone while walking in prohibited area"
                })
    
    # Rule 2: Trolley lane violation (Assembly Area)
    # Note: Ini butuh spatial analysis (koordinat bbox), untuk sekarang hanya deteksi trolley
    if "trolley_lane_violation" in special_rules:
        if "trolley" in detected_labels:
            # TODO: Implementasi pengecekan koordinat vs zona jalur kuning
            # Untuk sekarang, kita log bahwa trolley terdeteksi
            pass  # Placeholder untuk future spatial checking
    
    # Rule 3: Person lane violation (Assembly Area)
    if "person_lane_violation" in special_rules:
        # TODO: Implementasi pengecekan apakah person di jalur yang benar
        pass  # Placeholder untuk future spatial checking
    
    return hazards
