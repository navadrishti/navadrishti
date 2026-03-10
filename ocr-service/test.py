import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ocr.paddle_engine  import PaddleOCREngine
from ocr.extractors     import get_extractor
from engine.rule_engine import RuleEngine


VALID_DOC_TYPES = [
    "pan",
    "registration_certificate",
    "fcra",
    "audit_report",
    "trust_deed",
    "incorporation_document",
]

engine        = PaddleOCREngine()
rule_engine   = RuleEngine()
all_extracted = {}

image_files = sorted([f for f in os.listdir(".") if f.endswith((".png", ".jpg", ".jpeg"))])

if not image_files:
    print("no image files found in current folder")
    sys.exit()

if len(image_files) > len(VALID_DOC_TYPES):
    print(f"too many images — max {len(VALID_DOC_TYPES)} supported")
    sys.exit()

print(f"\nfound {len(image_files)} image(s) — mapping in this order:")
assignments = {}
for i, f in enumerate(image_files):
    doc_type = VALID_DOC_TYPES[i]
    assignments[doc_type] = f
    print(f"  {f} → {doc_type}")

print("\nSTEP 1 & 2: OCR + FIELD EXTRACTION")

for doc_type, image_path in assignments.items():
    print(f"\n{doc_type} ({image_path})")

    ocr    = engine.extract(image_path)
    print(f"confidence: {ocr.avg_confidence}% ({ocr.confidence_level})")

    extractor = get_extractor(doc_type)
    fields    = extractor.extract(ocr.full_text)

    for key, val in fields.items():
        if key == "document_type":
            continue
        print(f"  {'ok' if val else 'missing'}  {key}: {val}")

    all_extracted[doc_type] = fields

print("\nSTEP 3: RULE ENGINE")

result = rule_engine.run(all_extracted)

print(f"summary  : {result['summary']}")
print(f"errors   : {result['errors']}")
print(f"warnings : {result['warnings']}")
print("\nflags:")
for flag in result["flags"]:
    print(f"  {flag['message']}")