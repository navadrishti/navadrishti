# ─────────────────────────────────────────────
# validation/measure_accuracy.py
#
# runs OCR pipeline on every image/pdf in dataset.json
# compares extracted fields against ground truth
# prints per-doc-type accuracy + overall score
#
# usage:
#   cd ocr-service/
#   python validation/measure_accuracy.py
#
# images must be placed in:
#   validation/images/
#
# dataset.json must be at:
#   validation/ground_truth/dataset.json
# ─────────────────────────────────────────────

import os
import sys
import json
import re
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ocr.paddle_engine  import PaddleOCREngine
from ocr.extractors     import get_extractor

DATASET_PATH   = os.path.join(os.path.dirname(__file__), "ground_truth", "dataset.json")
IMAGES_DIR     = os.path.join(os.path.dirname(__file__), "images")


# ─────────────────────────────────────────────
# field comparison helpers
# ─────────────────────────────────────────────

def normalise(value):
    """lowercase, strip punctuation and extra spaces"""
    if value is None:
        return None
    return re.sub(r"[\s\.\,\-\/]+", " ", str(value).lower().strip())


def compare_field(predicted, expected, field_name):
    """
    returns (match: bool, score: float 0-1)
    exact match for IDs and numbers
    normalised match for names and addresses
    list match for vehicle_classes
    """
    if expected is None:
        return None, None   # skip — not applicable

    if predicted is None:
        return False, 0.0   # field not extracted

    # list comparison (vehicle_classes, authorised_persons)
    if isinstance(expected, list):
        if not isinstance(predicted, list):
            predicted = [predicted]
        exp_set  = set(normalise(e) for e in expected)
        pred_set = set(normalise(p) for p in predicted)
        if not exp_set:
            return None, None
        overlap = len(exp_set & pred_set) / len(exp_set)
        return overlap == 1.0, overlap

    # strict ID fields — exact match after normalise
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

    # date fields — normalise separators
    date_fields = {
        "dob_or_doi", "dob", "registration_date", "valid_until",
        "formation_date", "incorporation_date", "issue_date",
        "resolution_date",
    }
    if field_name in date_fields:
        p = re.sub(r"[\-\.]", "/", str(predicted).strip())
        e = re.sub(r"[\-\.]", "/", str(expected).strip())
        return p == e, 1.0 if p == e else 0.0

    # text fields — normalised comparison
    p = normalise(predicted)
    e = normalise(expected)

    if p == e:
        return True, 1.0

    # partial credit — expected is substring of predicted or vice versa
    if e and p and (e in p or p in e):
        shorter = min(len(e), len(p))
        longer  = max(len(e), len(p))
        score   = shorter / longer
        return False, round(score, 2)

    # word overlap for names and addresses
    e_words = set(e.split()) if e else set()
    p_words = set(p.split()) if p else set()
    if e_words:
        overlap = len(e_words & p_words) / len(e_words)
        return overlap >= 0.9, round(overlap, 2)

    return False, 0.0


# ─────────────────────────────────────────────
# main runner
# ─────────────────────────────────────────────

def run():
    dataset = json.load(open(DATASET_PATH))
    engine  = PaddleOCREngine()

    # stats per doc_type
    # { doc_type: { field: [scores] } }
    stats         = defaultdict(lambda: defaultdict(list))
    doc_type_totals = defaultdict(lambda: {"correct": 0, "total": 0, "skipped": 0})
    results       = []

    print("\n" + "=" * 70)
    print("NAVADRISHTI OCR — ACCURACY MEASUREMENT")
    print(f"Dataset: {len(dataset)} entries")
    print("=" * 70)

    for entry in dataset:
        doc_type   = entry["doc_type"]
        image_path = entry.get("image") or entry.get("pdf")
        ground_truth = entry["correct"]

        full_path = os.path.join(IMAGES_DIR, os.path.basename(image_path))

        if not os.path.exists(full_path):
            print(f"\n  ⚠️  FILE NOT FOUND — skipping: {full_path}")
            continue

        print(f"\n▶  {os.path.basename(image_path)}  [{doc_type}]")

        try:
            ocr       = engine.extract(full_path)
            extractor = get_extractor(doc_type)
            extracted = extractor.extract(ocr.full_text)
        except Exception as e:
            print(f"   ❌ OCR/extraction error: {e}")
            continue

        entry_result = {
            "image":    image_path,
            "doc_type": doc_type,
            "fields":   {}
        }

        for field, expected in ground_truth.items():
            predicted = extracted.get(field)
            match, score = compare_field(predicted, expected, field)

            if match is None:
                status = "N/A"
                doc_type_totals[doc_type]["skipped"] += 1
            elif match:
                status = "✅"
                doc_type_totals[doc_type]["correct"] += 1
                doc_type_totals[doc_type]["total"]   += 1
                stats[doc_type][field].append(1.0)
            else:
                status = f"❌ ({score:.0%})"
                doc_type_totals[doc_type]["total"] += 1
                stats[doc_type][field].append(score)

            print(f"   {status:<14} {field:<28} expected: {str(expected)[:40]:<42} got: {str(predicted)[:40]}")

            entry_result["fields"][field] = {
                "expected":  expected,
                "predicted": predicted,
                "match":     match,
                "score":     score,
            }

        results.append(entry_result)

    # ─────────────────────────────────────────
    # SUMMARY REPORT
    # ─────────────────────────────────────────

    print("\n\n" + "=" * 70)
    print("ACCURACY REPORT BY DOCUMENT TYPE")
    print("=" * 70)

    overall_correct = 0
    overall_total   = 0

    for doc_type in sorted(doc_type_totals.keys()):
        t       = doc_type_totals[doc_type]
        correct = t["correct"]
        total   = t["total"]
        acc     = correct / total * 100 if total > 0 else 0
        overall_correct += correct
        overall_total   += total

        bar    = "█" * int(acc / 5) + "░" * (20 - int(acc / 5))
        status = "🟢" if acc >= 85 else "🟡" if acc >= 65 else "🔴"
        print(f"\n  {status}  {doc_type:<35} {bar}  {acc:.1f}%  ({correct}/{total} fields)")

        # per-field breakdown
        for field, scores in sorted(stats[doc_type].items()):
            avg = sum(scores) / len(scores) * 100
            fi  = "  ✅" if avg >= 85 else "  ⚠️" if avg >= 65 else "  ❌"
            print(f"       {fi}  {field:<30} {avg:.1f}%")

    overall_acc = overall_correct / overall_total * 100 if overall_total > 0 else 0

    print("\n" + "=" * 70)
    print(f"  OVERALL ACCURACY:  {overall_acc:.1f}%  ({overall_correct}/{overall_total} fields correct)")
    cto_status = "✅ MEETS ACCURACY THRESHOLD (≥85%)" if overall_acc >= 85 else "❌ BELOW ACCURACY THRESHOLD (need ≥85%)"
    print(f"  STATUS:            {cto_status}")
    print("=" * 70)

    # save detailed results
    out_path = os.path.join(os.path.dirname(__file__), "accuracy_report.json")
    report = {
        "overall_accuracy":    round(overall_acc, 2),
        "total_fields":        overall_total,
        "correct_fields":      overall_correct,
        "meets_cto_threshold": overall_acc >= 85,
        "by_doc_type": {
            dt: {
                "accuracy": round(doc_type_totals[dt]["correct"] / doc_type_totals[dt]["total"] * 100, 2)
                            if doc_type_totals[dt]["total"] > 0 else 0,
                "correct":  doc_type_totals[dt]["correct"],
                "total":    doc_type_totals[dt]["total"],
                "per_field": {
                    f: round(sum(s) / len(s) * 100, 2)
                    for f, s in stats[dt].items()
                }
            }
            for dt in doc_type_totals
        },
        "detailed_results": results,
    }
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\n  Full report saved → validation/accuracy_report.json")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    run()