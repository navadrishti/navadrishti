# ─────────────────────────────────────────────
# output_formatter.py
# packages everything into standardized JSON
# for every processed document.
#
# status values:
#   FLAGGED          → rule engine errors found
#   INCOMPLETE       → required fields missing
#   PENDING_REVIEW → all checks passed
#
# entity_type:
#   individual → aadhaar, pan, voter_id, driving_license
#   ngo        → registration_certificate, fcra, trust_deed,
#                audit_report, incorporation_document, address_proof
#   company    → certificate_of_incorporation, gst_certificate,
#                board_resolution, audit_report
#
# accuracy block (optional):
#   included only when ground truth entry exists
#   in validation/ground_truth/dataset.json
# ─────────────────────────────────────────────

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from datetime import datetime
from config import OUTPUT_VERSION


ENTITY_TYPE_MAP = {
    "pan":                          "individual",
    "aadhaar":                      "individual",
    "voter_id":                     "individual",
    "driving_license":              "individual",
    "registration_certificate":     "ngo",
    "fcra":                         "ngo",
    "trust_deed":                   "ngo",
    "audit_report":                 "ngo_or_company",
    "incorporation_document":       "ngo",
    "address_proof":                "ngo_or_company",
    "certificate_of_incorporation": "company",
    "gst_certificate":              "company",
    "board_resolution":             "company",
}


def format_output(
    doc_type:      str,
    image_path:    str,
    ocr_result:    dict,
    scored_fields: dict,
    validation:    dict,
    accuracy:      dict = None,
) -> dict:

    fields_summary = {}
    missing_fields = []

    for field, data in scored_fields.items():
        if field == "document_type":
            continue
        if isinstance(data, dict):
            fields_summary[field] = data
            if data["value"] is None:
                missing_fields.append(field)
        else:
            fields_summary[field] = {"value": data, "confidence": 0, "level": "UNKNOWN"}

    output = {
        "version":      OUTPUT_VERSION,
        "processed_at": datetime.now().isoformat(),
        "document": {
            "type":        doc_type,
            "entity_type": ENTITY_TYPE_MAP.get(doc_type, "unknown"),
            "image_path":  image_path,
            "ocr": {
                "avg_confidence":   ocr_result.get("avg_confidence"),
                "confidence_level": ocr_result.get("confidence_level"),
                "total_lines":      ocr_result.get("total_lines"),
                "processing_time":  ocr_result.get("processing_time"),
                "page_count":       ocr_result.get("page_count", 1),
            },
        },
        "fields":         fields_summary,
        "missing_fields": missing_fields,
        "validation":     validation,
        "status":         _determine_status(missing_fields, validation),
    }

    # attach accuracy block only when ground truth was available
    if accuracy is not None:
        output["accuracy"] = {
            "score":            accuracy["accuracy"],
            "correct_fields":   accuracy["correct"],
            "total_fields":     accuracy["total"],
            "meets_threshold":  accuracy["meets_threshold"],
            "field_breakdown":  {
                fname: {
                    "match":     r["match"],
                    "score":     r["score"],
                    "expected":  r["expected"],
                    "predicted": r["predicted"],
                }
                for fname, r in accuracy["fields"].items()
            }
        }

    return output


def _determine_status(missing_fields: list, validation: dict) -> str:
    if validation.get("errors", 0) > 0:
        return "FLAGGED"
    if missing_fields:
        return "INCOMPLETE"
    return "PENDING_REVIEW"