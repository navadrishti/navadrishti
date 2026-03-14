# ─────────────────────────────────────────────
# config.py
# all tunable settings in one place
# change values here without touching any logic
# ─────────────────────────────────────────────

# name matching thresholds (used by rule_engine)
# below MIN  → ERROR   ❌
# MIN to MAX → WARNING ⚠️
# above MAX  → PASS    ✅
NAME_MATCH_THRESHOLD_MIN = 85
NAME_MATCH_THRESHOLD_MAX = 90

# ocr confidence thresholds (used by paddle_engine)
OCR_CONFIDENCE_HIGH   = 85
OCR_CONFIDENCE_MEDIUM = 65

# field confidence thresholds (used by confidence_scorer)
FIELD_CONFIDENCE_HIGH   = 90
FIELD_CONFIDENCE_MEDIUM = 70

# logging
LOG_FILE = "logs/extraction.log"

# output
OUTPUT_VERSION = "1.0"

# accuracy measurement (used by validation/measure_accuracy.py)
# accuracy threshold: overall field extraction accuracy target
ACCURACY_THRESHOLD_MIN      = 85.0   # minimum acceptable accuracy
ACCURACY_THRESHOLD_WARNING  = 65.0   # below this = field needs fixing