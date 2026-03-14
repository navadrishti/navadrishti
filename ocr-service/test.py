# ─────────────────────────────────────────────
# test.py
# main runner — drop document images or PDFs in
# the same folder and run:  python test.py
#
# supported formats: jpg, jpeg, png, pdf
# files mapped to doc types alphabetically:
#   1st file → pan
#   2nd file → registration_certificate
#   ...and so on up to 13 doc types
#
# if a file matches a ground truth entry in
# validation/ground_truth/dataset.json,
# accuracy is computed and shown automatically
#
# outputs saved to outputs/<doc_type>.json
# logs saved to logs/extraction.log
# ─────────────────────────────────────────────

import sys
import os
import json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ocr.paddle_engine              import PaddleOCREngine
from ocr.extractors                 import get_extractor
from engine.rule_engine             import RuleEngine
from confidence_scorer              import score_all_fields
from output_formatter               import format_output
from validation.accuracy_checker    import check_accuracy, accuracy_summary_line
from logger                         import (
    log_extraction_failure,
    log_ocr_low_confidence,
    log_validation_error,
    log_format_check_failed,
    log_case_processed,
)


VALID_DOC_TYPES = [
    "pan",
    "registration_certificate",
    "fcra",
    "audit_report",
    "trust_deed",
    "incorporation_document",
    "certificate_of_incorporation",
    "gst_certificate",
    "aadhaar",
    "address_proof",
    "board_resolution",
    "voter_id",
    "driving_license",
]

engine      = PaddleOCREngine()
rule_engine = RuleEngine()

# pick up images AND pdfs
input_files = sorted([
    f for f in os.listdir(".")
    if f.lower().endswith((".png", ".jpg", ".jpeg", ".pdf"))
])

if not input_files:
    print("\nno files found — drop images or PDFs in the same folder as test.py\n")
    sys.exit()

if len(input_files) > len(VALID_DOC_TYPES):
    print(f"\ntoo many files — max {len(VALID_DOC_TYPES)} supported\n")
    sys.exit()

print(f"\nfound {len(input_files)} file(s) — mapping in sequence:")
assignments = {}
for i, f in enumerate(input_files):
    doc_type = VALID_DOC_TYPES[i]
    assignments[doc_type] = f
    file_type = "PDF" if f.lower().endswith(".pdf") else "IMG"
    print(f"  [{file_type}] {f}  →  {doc_type}")


# ─────────────────────────────────────────────
# STEP 1 + 2  OCR + FIELD EXTRACTION
# ─────────────────────────────────────────────

print("\n" + "="*60)
print("STEP 1 & 2  —  OCR + FIELD EXTRACTION")
print("="*60)

all_extracted = {}
all_scored    = {}
all_ocr       = {}
all_accuracy  = {}

for doc_type, image_path in assignments.items():
    print(f"\n▶  {doc_type}  ({image_path})")

    ocr = engine.extract(image_path)
    print(f"   ocr confidence  : {ocr.avg_confidence}%  ({ocr.confidence_level})")
    print(f"   lines detected  : {len(ocr.lines)}")
    print(f"   processing time : {ocr.processing_time}s")
    if ocr.page_count > 1:
        print(f"   pages           : {ocr.page_count}")

    if ocr.avg_confidence < 65:
        log_ocr_low_confidence(doc_type, image_path, ocr.avg_confidence)

    extractor = get_extractor(doc_type)
    fields    = extractor.extract(ocr.full_text)
    scored    = score_all_fields(fields, ocr.avg_confidence)

    print(f"\n   {'FIELD':<26} {'VALUE':<32} CONFIDENCE")
    print(f"   {'─'*72}")
    for field, data in scored.items():
        if field == "document_type":
            continue
        if isinstance(data, dict):
            val     = data["value"]
            conf    = data["confidence"]
            level   = data["level"]
            status  = "✅" if val else "❌"
            val_str = str(val) if val else "NOT FOUND"
            print(f"   {status}  {field:<26} {val_str:<32} {conf}%  {level}")
            if not val:
                log_extraction_failure(doc_type, field, "field not found in OCR output")
        else:
            print(f"   ✅  {field:<26} {str(data)}")

    # ── accuracy check against ground truth ──
    accuracy = check_accuracy(doc_type, image_path, fields)
    if accuracy:
        print(f"\n   {accuracy_summary_line(accuracy)}")
        if not accuracy["meets_threshold"]:
            print(f"   ⚠️  below accuracy threshold — field breakdown:")
            for fname, fresult in accuracy["fields"].items():
                if not fresult["match"]:
                    print(f"      ❌  {fname:<26} expected: {str(fresult['expected'])[:35]:<37} got: {str(fresult['predicted'])[:35]}")
    else:
        print(f"\n   accuracy: no ground truth entry for this file")

    all_extracted[doc_type] = fields
    all_scored[doc_type]    = scored
    all_ocr[doc_type]       = ocr
    all_accuracy[doc_type]  = accuracy


# ─────────────────────────────────────────────
# STEP 3  RULE ENGINE
# ─────────────────────────────────────────────

print("\n" + "="*60)
print("STEP 3  —  RULE ENGINE VALIDATION")
print("="*60)

validation = rule_engine.run(all_extracted)

print(f"\n   summary  :  {validation['summary']}")
print(f"   errors   :  {validation['errors']}")
print(f"   warnings :  {validation['warnings']}")
print(f"   total    :  {validation['total_flags']} flags\n")
print(f"   {'─'*55}")

for flag in validation["flags"]:
    print(f"   {flag['message']}")
    if flag["severity"] == "ERROR":
        log_validation_error(flag["doc_type"], flag["rule"], flag["message"])
    if flag["rule"] in ("PAN_FORMAT", "GSTIN_FORMAT", "CIN_FORMAT", "EPIC_FORMAT", "AADHAAR_FORMAT", "FCRA_FORMAT"):
        log_format_check_failed(flag["doc_type"], flag["field"], "", flag["rule"])


# ─────────────────────────────────────────────
# STEP 4  STRUCTURED JSON OUTPUT
# ─────────────────────────────────────────────

print("\n" + "="*60)
print("STEP 4  —  STRUCTURED JSON OUTPUT")
print("="*60)

os.makedirs("outputs", exist_ok=True)

for doc_type, image_path in assignments.items():
    ocr      = all_ocr[doc_type]
    scored   = all_scored[doc_type]
    accuracy = all_accuracy.get(doc_type)

    output = format_output(
        doc_type      = doc_type,
        image_path    = image_path,
        ocr_result    = ocr.to_dict(),
        scored_fields = scored,
        validation    = validation,
        accuracy      = accuracy,
    )
    out_path = f"outputs/{doc_type}.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n   ▶  {doc_type}")
    print(f"      status          : {output['status']}")
    print(f"      missing fields  : {output['missing_fields'] or 'none'}")
    if accuracy:
        print(f"      accuracy        : {accuracy['accuracy']}%  ({accuracy['correct']}/{accuracy['total']} fields)")
    print(f"      saved to        : {out_path}")


# ─────────────────────────────────────────────
# STEP 5  ACCURACY SUMMARY
# ─────────────────────────────────────────────

has_accuracy = {k: v for k, v in all_accuracy.items() if v}
if has_accuracy:
    print("\n" + "="*60)
    print("STEP 5  —  ACCURACY SUMMARY")
    print("="*60)

    total_correct = sum(v["correct"] for v in has_accuracy.values())
    total_fields  = sum(v["total"]   for v in has_accuracy.values())
    overall       = round(total_correct / total_fields * 100, 1) if total_fields > 0 else 0

    for doc_type, acc in has_accuracy.items():
        bar    = "█" * int(acc["accuracy"] / 5) + "░" * (20 - int(acc["accuracy"] / 5))
        status = "🟢" if acc["accuracy"] >= 85 else "🟡" if acc["accuracy"] >= 65 else "🔴"
        print(f"\n  {status}  {doc_type:<35} {bar}  {acc['accuracy']}%")

    meets = "✅ MEETS ACCURACY THRESHOLD" if overall >= 85 else "❌ BELOW ACCURACY THRESHOLD"
    print(f"\n  OVERALL: {overall}%  —  {meets} (≥85%)")


# ─────────────────────────────────────────────
# DONE
# ─────────────────────────────────────────────

import uuid; log_case_processed(str(uuid.uuid4())[:8].upper(), "pipeline run", validation["summary"])

print("\n" + "="*60)
print("DONE")
print(f"   JSON outputs  →  outputs/")
print(f"   failure logs  →  logs/extraction.log")
print("="*60 + "\n")