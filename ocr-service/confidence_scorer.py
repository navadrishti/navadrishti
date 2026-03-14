# ─────────────────────────────────────────────
# confidence_scorer.py
# scores each extracted field individually
# uses regex pattern matching + ocr confidence
# to estimate how reliable each field value is
# ─────────────────────────────────────────────

import re
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import FIELD_CONFIDENCE_HIGH, FIELD_CONFIDENCE_MEDIUM


# fields with known fixed formats
# if extracted value matches → high confidence boost
FIELD_PATTERNS = {
    "pan_number":          r"^[A-Z]{5}[0-9]{4}[A-Z]$",
    "dob_or_doi":          r"^\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}$",
    "registration_number": r"^[A-Z0-9\/\-]{5,}$",
    "fcra_number":         r"^\d{9}$",
    "financial_year":      r"^20\d{2}[\-\/]2?\d{2}$",
    "auditor_reg_number":  r"^\d{5,7}$",
}


def score_field(field_name: str, value, ocr_confidence: float) -> dict:
    """
    score a single extracted field.
    returns { value, confidence (0-100), level (HIGH/MEDIUM/LOW/MISSING) }
    """
    if not value:
        return {"value": None, "confidence": 0, "level": "MISSING"}

    pattern = FIELD_PATTERNS.get(field_name)

    if pattern:
        # field has a known format — reward format match
        format_ok  = bool(re.match(pattern, str(value).strip()))
        confidence = round(ocr_confidence * 0.6 + (40 if format_ok else 0))
    else:
        # free text field (name, address etc) — rely on ocr confidence
        confidence = round(ocr_confidence * 0.9)

    confidence = min(confidence, 100)

    if confidence >= FIELD_CONFIDENCE_HIGH:
        level = "HIGH"
    elif confidence >= FIELD_CONFIDENCE_MEDIUM:
        level = "MEDIUM"
    else:
        level = "LOW"

    return {"value": value, "confidence": confidence, "level": level}


def score_all_fields(extracted_fields: dict, ocr_confidence: float) -> dict:
    """
    score every field returned by an extractor.
    document_type is passed through unchanged.
    """
    scored = {}
    for field_name, value in extracted_fields.items():
        if field_name == "document_type":
            scored[field_name] = value
            continue
        scored[field_name] = score_field(field_name, value, ocr_confidence)
    return scored