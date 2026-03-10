import re
from datetime import datetime
from typing import Optional
from fuzzywuzzy import fuzz
from dateutil import parser as dateparser
from dataclasses import dataclass, field


# ── Flag Model ────────────────────────────────────────────────────

@dataclass
class Flag:
    """A single validation flag raised by the rule engine."""
    severity:  str   
    rule:      str   
    message:   str   
    field:     str   
    doc_type:  str   

    @property
    def icon(self) -> str:
        return {"ERROR": "❌", "WARNING": "⚠️", "INFO": "ℹ️"}.get(self.severity, "•")

    def to_dict(self) -> dict:
        return {
            "severity": self.severity,
            "rule":     self.rule,
            "message":  f"{self.icon} {self.message}",
            "field":    self.field,
            "doc_type": self.doc_type,
        }


# ── Rule Engine ───────────────────────────────────────────────────

class RuleEngine:
    NAME_MATCH_THRESHOLD = 85   

    def run(self, extracted_docs: dict) -> dict:
        flags = []

        # ── Rule Group 1: Format Checks ───────────────────────
        flags += self._check_pan_format(extracted_docs)
        flags += self._check_fcra_format(extracted_docs)
        flags += self._check_required_fields(extracted_docs)

        # ── Rule Group 2: Expiry Checks ───────────────────────
        flags += self._check_expiry(extracted_docs)

        # ── Rule Group 3: Cross-Document Name Matching ────────
        flags += self._check_name_consistency(extracted_docs)

        # ── Rule Group 4: Logical Consistency ─────────────────
        flags += self._check_date_logic(extracted_docs)

        # ── Summary ───────────────────────────────────────────
        errors   = [f for f in flags if f.severity == "ERROR"]
        warnings = [f for f in flags if f.severity == "WARNING"]
        infos    = [f for f in flags if f.severity == "INFO"]

        return {
            "flags":         [f.to_dict() for f in flags],
            "total_flags":   len(flags),
            "errors":        len(errors),
            "warnings":      len(warnings),
            "infos":         len(infos),
            "ca_action_needed": len(errors) > 0 or len(warnings) > 0,
            "summary": self._summarise(flags),
        }

    # ── Rule Group 1: Format Checks ──────────────────────────────

    def _check_pan_format(self, docs: dict) -> list:
        flags = []
        pan_data = docs.get("pan", {})
        pan = pan_data.get("pan_number")

        if not pan:
            flags.append(Flag(
                severity = "ERROR",
                rule     = "PAN_FORMAT",
                message  = "PAN number could not be extracted from PAN card",
                field    = "pan_number",
                doc_type = "pan",
            ))
            return flags

        pattern = r"^[A-Z]{5}[0-9]{4}[A-Z]$"
        if not re.match(pattern, pan):
            flags.append(Flag(
                severity = "ERROR",
                rule     = "PAN_FORMAT",
                message  = f"PAN '{pan}' does not match valid format (ABCDE1234F)",
                field    = "pan_number",
                doc_type = "pan",
            ))
        else:
            flags.append(Flag(
                severity = "INFO",
                rule     = "PAN_FORMAT",
                message  = f"PAN '{pan}' format is valid",
                field    = "pan_number",
                doc_type = "pan",
            ))

        return flags

    def _check_fcra_format(self, docs: dict) -> list:
        flags = []
        fcra_data = docs.get("fcra")
        if not fcra_data:
            return flags  # FCRA is optional

        fcra_no = fcra_data.get("fcra_number")
        if not fcra_no:
            flags.append(Flag(
                severity = "ERROR",
                rule     = "FCRA_FORMAT",
                message  = "FCRA number could not be extracted",
                field    = "fcra_number",
                doc_type = "fcra",
            ))
        elif not re.match(r"^\d{9}$", str(fcra_no)):
            flags.append(Flag(
                severity = "WARNING",
                rule     = "FCRA_FORMAT",
                message  = f"FCRA number '{fcra_no}' may be incorrect (expected 9 digits)",
                field    = "fcra_number",
                doc_type = "fcra",
            ))

        return flags

    def _check_required_fields(self, docs: dict) -> list:

        flags = []

        REQUIRED = {
            "registration_certificate": ["organisation_name", "registration_number", "registration_date"],
            "pan":                      ["pan_number", "name"],
            "fcra":                     ["fcra_number", "organisation_name", "valid_until"],
            "audit_report":             ["organisation_name", "financial_year"],
            "trust_deed":               ["organisation_name", "formation_date"],
            "incorporation_document":   ["organisation_name", "formation_date"],
        }

        for doc_type, required_fields in REQUIRED.items():
            doc_data = docs.get(doc_type)
            if not doc_data:
                continue  # Doc not uploaded, skip
            for f in required_fields:
                if not doc_data.get(f):
                    flags.append(Flag(
                        severity = "ERROR",
                        rule     = "REQUIRED_FIELD",
                        message  = f"Could not extract '{f}' from {doc_type.replace('_',' ').title()}",
                        field    = f,
                        doc_type = doc_type,
                    ))

        return flags

    # ── Rule Group 2: Expiry Checks ──────────────────────────────

    def _check_expiry(self, docs: dict) -> list:
        flags = []
        today = datetime.today()

        EXPIRY_FIELDS = [
            ("registration_certificate", "valid_until",  "Registration Certificate"),
            ("fcra",                     "valid_until",  "FCRA Certificate"),
        ]

        for doc_type, date_field, label in EXPIRY_FIELDS:
            doc_data = docs.get(doc_type)
            if not doc_data:
                continue
            date_str = doc_data.get(date_field)
            if not date_str:
                continue

            try:
                expiry = dateparser.parse(date_str, dayfirst=True)
                if expiry < today:
                    days_ago = (today - expiry).days
                    flags.append(Flag(
                        severity = "ERROR",
                        rule     = "EXPIRY_CHECK",
                        message  = f"{label} expired {days_ago} days ago ({date_str})",
                        field    = date_field,
                        doc_type = doc_type,
                    ))
                elif (expiry - today).days < 90:
                    days_left = (expiry - today).days
                    flags.append(Flag(
                        severity = "WARNING",
                        rule     = "EXPIRY_CHECK",
                        message  = f"{label} expires in {days_left} days ({date_str}) — inform entity",
                        field    = date_field,
                        doc_type = doc_type,
                    ))
                else:
                    flags.append(Flag(
                        severity = "INFO",
                        rule     = "EXPIRY_CHECK",
                        message  = f"{label} is valid until {date_str}",
                        field    = date_field,
                        doc_type = doc_type,
                    ))
            except Exception:
                flags.append(Flag(
                    severity = "WARNING",
                    rule     = "EXPIRY_CHECK",
                    message  = f"Could not parse expiry date '{date_str}' — verify manually",
                    field    = date_field,
                    doc_type = doc_type,
                ))

        return flags

    # ── Rule Group 3: Cross-Document Name Matching ───────────────

    def _check_name_consistency(self, docs: dict) -> list:
        flags = []

        # Collect all names found across documents
        name_sources = {}
        name_fields = {
            "pan":                    "name",
            "registration_certificate": "organisation_name",
            "fcra":                   "organisation_name",
            "audit_report":           "organisation_name",
            "trust_deed":             "organisation_name",
            "incorporation_document": "organisation_name",
        }

        for doc_type, field_name in name_fields.items():
            doc_data = docs.get(doc_type)
            if doc_data and doc_data.get(field_name):
                name_sources[doc_type] = doc_data[field_name].upper().strip()

        if len(name_sources) < 2:
            return flags  # Need at least 2 docs to compare

        # Compare every pair
        sources = list(name_sources.items())
        for i in range(len(sources)):
            for j in range(i + 1, len(sources)):
                doc1, name1 = sources[i]
                doc2, name2 = sources[j]

                # Fuzzy ratio — handles OCR typos and minor variations
                similarity = fuzz.token_sort_ratio(name1, name2)

                if similarity < self.NAME_MATCH_THRESHOLD:
                    flags.append(Flag(
                        severity = "ERROR",
                        rule     = "NAME_MISMATCH",
                        message  = (
                            f"Name mismatch between {doc1.replace('_',' ').title()} "
                            f"('{name1}') and {doc2.replace('_',' ').title()} "
                            f"('{name2}') — similarity: {similarity}%"
                        ),
                        field    = "organisation_name",
                        doc_type = f"{doc1} vs {doc2}",
                    ))
                elif similarity < 95:
                    flags.append(Flag(
                        severity = "WARNING",
                        rule     = "NAME_MISMATCH",
                        message  = (
                            f"Slight name variation between "
                            f"{doc1.replace('_',' ').title()} ('{name1}') and "
                            f"{doc2.replace('_',' ').title()} ('{name2}') — "
                            f"similarity: {similarity}% — verify manually"
                        ),
                        field    = "organisation_name",
                        doc_type = f"{doc1} vs {doc2}",
                    ))
                else:
                    flags.append(Flag(
                        severity = "INFO",
                        rule     = "NAME_MATCH",
                        message  = (
                            f"Name consistent across "
                            f"{doc1.replace('_',' ').title()} and "
                            f"{doc2.replace('_',' ').title()} ({similarity}% match)"
                        ),
                        field    = "organisation_name",
                        doc_type = f"{doc1} vs {doc2}",
                    ))

        return flags

    # ── Rule Group 4: Date Logic ──────────────────────────────────

    def _check_date_logic(self, docs: dict) -> list:
        flags = []

        def parse_date(d: Optional[str]) -> Optional[datetime]:
            if not d:
                return None
            try:
                return dateparser.parse(d, dayfirst=True)
            except Exception:
                return None

        today = datetime.today()

        # FCRA date after registration date
        reg_date  = parse_date(docs.get("registration_certificate", {}).get("registration_date"))
        fcra_date = parse_date(docs.get("fcra", {}).get("registration_date"))
        if reg_date and fcra_date and fcra_date < reg_date:
            flags.append(Flag(
                severity = "ERROR",
                rule     = "DATE_LOGIC",
                message  = "FCRA registration date is BEFORE organisation registration date — suspicious",
                field    = "registration_date",
                doc_type = "fcra vs registration_certificate",
            ))

        # Audit report should be within last 3 years
        audit_fy = docs.get("audit_report", {}).get("financial_year")
        if audit_fy:
            fy_match = re.search(r"(20\d{2})", audit_fy)
            if fy_match:
                fy_year = int(fy_match.group(1))
                if today.year - fy_year > 3:
                    flags.append(Flag(
                        severity = "WARNING",
                        rule     = "DATE_LOGIC",
                        message  = f"Audit report is for FY {audit_fy} — may be outdated (>3 years old)",
                        field    = "financial_year",
                        doc_type = "audit_report",
                    ))

        return flags

    # ── Summary ───────────────────────────────────────────────────

    def _summarise(self, flags: list) -> str:
        errors   = sum(1 for f in flags if f.severity == "ERROR")
        warnings = sum(1 for f in flags if f.severity == "WARNING")
        if errors == 0 and warnings == 0:
            return "✅ All checks passed — ready for CA review"
        elif errors > 0:
            return f"❌ {errors} error(s) found — CA must review before approving"
        else:
            return f"⚠️ {warnings} warning(s) — CA should verify these manually"