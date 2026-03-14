# ─────────────────────────────────────────────
# validation/accuracy_checker.py
#
# reusable accuracy comparison module.
# imported by both test.py and measure_accuracy.py
#
# given extracted fields + doc_type,
# finds matching ground truth entries from
# dataset.json and computes field-level accuracy.
# ─────────────────────────────────────────────

import os
import re
import json
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import ACCURACY_THRESHOLD_MIN

DATASET_PATH = os.path.join(os.path.dirname(__file__), "ground_truth", "dataset.json")

# load dataset once at import
_dataset = None

def _load_dataset():
    global _dataset
    if _dataset is None:
        if os.path.exists(DATASET_PATH):
            _dataset = json.load(open(DATASET_PATH))
        else:
            _dataset = []
    return _dataset


def normalise(value):
    if value is None:
        return None
    return re.sub(r"[\s\.\,\-\/]+", " ", str(value).lower().strip())


def compare_field(predicted, expected, field_name):
    """
    returns (match: bool | None, score: float | None)
    None means field is not applicable (expected is null)
    """
    if expected is None:
        return None, None

    if predicted is None:
        return False, 0.0

    # list fields
    if isinstance(expected, list):
        if not isinstance(predicted, list):
            predicted = [predicted]
        exp_set  = set(normalise(e) for e in expected)
        pred_set = set(normalise(p) for p in predicted)
        if not exp_set:
            return None, None
        overlap = len(exp_set & pred_set) / len(exp_set)
        return overlap == 1.0, round(overlap, 2)

    # strict ID fields
    strict_fields = {
        "pan_number", "fcra_number", "gstin", "cin",
        "epic_number", "license_number", "aadhaar_number",
        "resolution_number", "registration_number",
        "auditor_reg_number", "pan",
    }
    if field_name in strict_fields:
        p = normalise(predicted)
        e = normalise(expected)
        return p == e, 1.0 if p == e else 0.0

    # date fields
    date_fields = {
        "dob_or_doi", "dob", "registration_date", "valid_until",
        "formation_date", "incorporation_date", "issue_date",
        "resolution_date",
    }
    if field_name in date_fields:
        p = re.sub(r"[\-\.]", "/", str(predicted).strip())
        e = re.sub(r"[\-\.]", "/", str(expected).strip())
        return p == e, 1.0 if p == e else 0.0

    # text fields — word overlap
    p = normalise(predicted)
    e = normalise(expected)
    if p == e:
        return True, 1.0
    if e and p and (e in p or p in e):
        score = min(len(e), len(p)) / max(len(e), len(p))
        return False, round(score, 2)
    e_words = set(e.split()) if e else set()
    p_words = set(p.split()) if p else set()
    if e_words:
        overlap = len(e_words & p_words) / len(e_words)
        return overlap >= 0.9, round(overlap, 2)
    return False, 0.0


def check_accuracy(doc_type: str, image_filename: str, extracted_fields: dict) -> dict:
    """
    finds the ground truth entry for this image + doc_type
    compares extracted fields against ground truth
    returns accuracy summary dict

    returns None if no matching ground truth entry found
    """
    dataset = _load_dataset()
    if not dataset:
        return None

    # find matching entry by filename
    basename = os.path.basename(image_filename)
    match    = None
    for entry in dataset:
        entry_file = entry.get("image") or entry.get("pdf") or ""
        if os.path.basename(entry_file) == basename and entry["doc_type"] == doc_type:
            match = entry
            break

    if not match:
        return None

    ground_truth = match["correct"]
    field_results = {}
    correct = 0
    total   = 0

    for field, expected in ground_truth.items():
        predicted     = extracted_fields.get(field)
        is_match, score = compare_field(predicted, expected, field)

        if is_match is None:
            continue  # skip null ground truth fields

        total += 1
        if is_match:
            correct += 1

        field_results[field] = {
            "expected":  expected,
            "predicted": predicted,
            "match":     is_match,
            "score":     score,
        }

    accuracy = round(correct / total * 100, 1) if total > 0 else 0.0

    return {
        "accuracy":      accuracy,
        "correct":       correct,
        "total":         total,
        "meets_threshold": accuracy >= ACCURACY_THRESHOLD_MIN,
        "fields":        field_results,
    }


def accuracy_summary_line(accuracy_result: dict) -> str:
    if not accuracy_result:
        return "accuracy: no ground truth available"
    acc = accuracy_result["accuracy"]
    c   = accuracy_result["correct"]
    t   = accuracy_result["total"]
    icon = "✅" if acc >= 85 else "⚠️" if acc >= 65 else "❌"
    icon = "✅" if acc >= ACCURACY_THRESHOLD_MIN else "⚠️" if acc >= 65 else "❌"