# ─────────────────────────────────────────────
# logger.py
# logs all events to logs/extraction.log
# as newline-delimited JSON
#
# log events:
#   extraction_failed    — field not found in OCR output
#   low_ocr_confidence   — overall OCR confidence below threshold
#   validation_failed    — rule engine raised ERROR flag
#   format_check_failed  — PAN/GSTIN/CIN/EPIC/Aadhaar format invalid
#   case_processed       — end of every pipeline run
# ─────────────────────────────────────────────

import os
import json
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from datetime import datetime
from config import LOG_FILE

os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)


def _write(level, event, details):
    entry = {
        "timestamp": datetime.now().isoformat(),
        "level":     level,
        "event":     event,
        "details":   details,
    }
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
    print(f"  [LOG {level}] {event} → {details}")


def log_extraction_failure(doc_type, field, reason):
    """field not found in OCR output"""
    _write("FAILURE", "extraction_failed", {
        "doc_type": doc_type,
        "field":    field,
        "reason":   reason,
    })


def log_ocr_low_confidence(doc_type, image_path, confidence):
    """overall OCR confidence below threshold"""
    _write("WARNING", "low_ocr_confidence", {
        "doc_type":   doc_type,
        "image_path": image_path,
        "confidence": confidence,
    })


def log_validation_error(doc_type, rule, message):
    """rule engine raised ERROR flag"""
    _write("ERROR", "validation_failed", {
        "doc_type": doc_type,
        "rule":     rule,
        "message":  message,
    })


def log_format_check_failed(doc_type, field, value, expected_format):
    """PAN / GSTIN / CIN / EPIC / Aadhaar format check failed"""
    _write("ERROR", "format_check_failed", {
        "doc_type":        doc_type,
        "field":           field,
        "value":           value,
        "expected_format": expected_format,
    })


def log_case_processed(case_id, entity_name, status):
    """end of every pipeline run"""
    _write("INFO", "case_processed", {
        "case_id":     case_id,
        "entity_name": entity_name,
        "status":      status,
    })