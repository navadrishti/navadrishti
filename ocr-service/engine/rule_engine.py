# ─────────────────────────────────────────────
# engine/rule_engine.py
# validates all extracted fields across all 13 doc types
#
# format checks:
#   PAN      — pan, gst_certificate, certificate_of_incorporation, fcra, audit_report
#   FCRA     — fcra
#   GSTIN    — gst_certificate
#   CIN      — certificate_of_incorporation
#   EPIC     — voter_id
#   Aadhaar  — aadhaar
#
# required fields — all 13 doc types
#
# expiry checks:
#   registration_certificate, fcra, gst_certificate, driving_license
#
# cross-document name consistency:
#   pan, registration_certificate, fcra, audit_report,
#   trust_deed, incorporation_document,
#   certificate_of_incorporation, gst_certificate,
#   aadhaar, voter_id, driving_license
#
# date logic:
#   fcra date vs registration date
#   audit report age
#   driving license issue vs expiry
#   board resolution date not in future
# ─────────────────────────────────────────────

import re
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime
from dataclasses import dataclass
from dateutil import parser as dateparser
from sentence_transformers import SentenceTransformer, util
from config import NAME_MATCH_THRESHOLD_MIN, NAME_MATCH_THRESHOLD_MAX

_model = SentenceTransformer("all-MiniLM-L6-v2")


def _embedding_similarity(name1: str, name2: str) -> float:
    emb1  = _model.encode(name1, convert_to_tensor=True)
    emb2  = _model.encode(name2, convert_to_tensor=True)
    score = util.cos_sim(emb1, emb2).item()
    return round(score * 100, 1)


@dataclass
class Flag:
    severity: str
    rule:     str
    message:  str
    field:    str
    doc_type: str

    @property
    def icon(self):
        return {"ERROR": "❌", "WARNING": "⚠️", "INFO": "✅"}.get(self.severity, "•")

    def to_dict(self):
        return {
            "severity": self.severity,
            "rule":     self.rule,
            "message":  f"{self.icon} {self.message}",
            "field":    self.field,
            "doc_type": self.doc_type,
        }


class RuleEngine:

    NAME_MATCH_THRESHOLD_MIN = NAME_MATCH_THRESHOLD_MIN
    NAME_MATCH_THRESHOLD_MAX = NAME_MATCH_THRESHOLD_MAX

    def run(self, extracted_docs: dict) -> dict:
        flags  = []
        flags += self._check_pan_format(extracted_docs)
        flags += self._check_fcra_format(extracted_docs)
        flags += self._check_gstin_format(extracted_docs)
        flags += self._check_cin_format(extracted_docs)
        flags += self._check_epic_format(extracted_docs)
        flags += self._check_aadhaar_format(extracted_docs)
        flags += self._check_required_fields(extracted_docs)
        flags += self._check_expiry(extracted_docs)
        flags += self._check_name_consistency(extracted_docs)
        flags += self._check_date_logic(extracted_docs)

        errors   = [f for f in flags if f.severity == "ERROR"]
        warnings = [f for f in flags if f.severity == "WARNING"]

        return {
            "flags":            [f.to_dict() for f in flags],
            "total_flags":      len(flags),
            "errors":           len(errors),
            "warnings":         len(warnings),
            "review_required": len(errors) > 0 or len(warnings) > 0,
            "summary":          self._summarise(flags),
        }

    # ─────────────────────────────────────────
    # FORMAT CHECKS
    # ─────────────────────────────────────────

    def _check_pan_format(self, docs):
        flags   = []
        pan_map = {
            "pan":                          "pan_number",
            "gst_certificate":              "pan",
            "certificate_of_incorporation": "pan",
            "fcra":                         "pan",
            "audit_report":                 "pan",
        }
        for doc_type, field in pan_map.items():
            data = docs.get(doc_type)
            if not data:
                continue
            pan = data.get(field)
            if not pan:
                continue
            if not re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]$", pan):
                flags.append(Flag("ERROR", "PAN_FORMAT", f"PAN '{pan}' in {doc_type.replace('_',' ').title()} is not valid format (ABCDE1234F)", field, doc_type))
            else:
                flags.append(Flag("INFO", "PAN_FORMAT", f"PAN '{pan}' in {doc_type.replace('_',' ').title()} is valid", field, doc_type))

        # pan doc specifically must have pan_number
        pan_doc = docs.get("pan", {})
        if pan_doc and not pan_doc.get("pan_number"):
            flags.append(Flag("ERROR", "PAN_FORMAT", "PAN number could not be extracted from PAN card", "pan_number", "pan"))

        return flags

    def _check_fcra_format(self, docs):
        flags     = []
        fcra_data = docs.get("fcra")
        if not fcra_data:
            return flags
        fcra_no = fcra_data.get("fcra_number")
        if not fcra_no:
            flags.append(Flag("ERROR", "FCRA_FORMAT", "FCRA number could not be extracted", "fcra_number", "fcra"))
        elif not re.match(r"^\d{9}$", str(fcra_no)):
            flags.append(Flag("WARNING", "FCRA_FORMAT", f"FCRA '{fcra_no}' may be incorrect — expected 9 digits", "fcra_number", "fcra"))
        else:
            flags.append(Flag("INFO", "FCRA_FORMAT", f"FCRA '{fcra_no}' format is valid", "fcra_number", "fcra"))
        return flags

    def _check_gstin_format(self, docs):
        flags    = []
        gst_data = docs.get("gst_certificate")
        if not gst_data:
            return flags
        gstin = gst_data.get("gstin")
        if not gstin:
            flags.append(Flag("ERROR", "GSTIN_FORMAT", "GSTIN could not be extracted", "gstin", "gst_certificate"))
        elif not re.match(r"^\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z0-9]$", gstin):
            flags.append(Flag("ERROR", "GSTIN_FORMAT", f"GSTIN '{gstin}' is not valid format", "gstin", "gst_certificate"))
        else:
            flags.append(Flag("INFO", "GSTIN_FORMAT", f"GSTIN '{gstin}' format is valid", "gstin", "gst_certificate"))
        return flags

    def _check_cin_format(self, docs):
        flags    = []
        coi_data = docs.get("certificate_of_incorporation")
        if not coi_data:
            return flags
        cin = coi_data.get("cin")
        if not cin:
            flags.append(Flag("ERROR", "CIN_FORMAT", "CIN could not be extracted", "cin", "certificate_of_incorporation"))
        elif not re.match(r"^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$", cin):
            flags.append(Flag("ERROR", "CIN_FORMAT", f"CIN '{cin}' is not valid format", "cin", "certificate_of_incorporation"))
        else:
            flags.append(Flag("INFO", "CIN_FORMAT", f"CIN '{cin}' format is valid", "cin", "certificate_of_incorporation"))
        return flags

    def _check_epic_format(self, docs):
        flags    = []
        vid_data = docs.get("voter_id")
        if not vid_data:
            return flags
        epic = vid_data.get("epic_number")
        if not epic:
            flags.append(Flag("ERROR", "EPIC_FORMAT", "EPIC number could not be extracted", "epic_number", "voter_id"))
        elif not re.match(r"^[A-Z]{3}\d{7}$", epic):
            flags.append(Flag("ERROR", "EPIC_FORMAT", f"EPIC '{epic}' is not valid format (ABC1234567)", "epic_number", "voter_id"))
        else:
            flags.append(Flag("INFO", "EPIC_FORMAT", f"EPIC '{epic}' format is valid", "epic_number", "voter_id"))
        return flags

    def _check_aadhaar_format(self, docs):
        flags        = []
        aadhaar_data = docs.get("aadhaar")
        if not aadhaar_data:
            return flags
        number = aadhaar_data.get("aadhaar_number")
        if not number:
            flags.append(Flag("ERROR", "AADHAAR_FORMAT", "Aadhaar number could not be extracted", "aadhaar_number", "aadhaar"))
        else:
            clean = str(number).replace("X", "").replace(" ", "")
            if not re.match(r"^\d{4,12}$", clean):
                flags.append(Flag("ERROR", "AADHAAR_FORMAT", f"Aadhaar number '{number}' appears invalid", "aadhaar_number", "aadhaar"))
            else:
                flags.append(Flag("INFO", "AADHAAR_FORMAT", "Aadhaar number extracted successfully", "aadhaar_number", "aadhaar"))
        return flags

    # ─────────────────────────────────────────
    # REQUIRED FIELDS
    # ─────────────────────────────────────────

    def _check_required_fields(self, docs):
        flags    = []
        required = {
            "pan":                          ["pan_number", "name"],
            "registration_certificate":     ["organisation_name", "registration_number", "registration_date"],
            "fcra":                         ["fcra_number", "organisation_name", "valid_until"],
            "audit_report":                 ["organisation_name", "financial_year"],
            "trust_deed":                   ["organisation_name", "formation_date"],
            "incorporation_document":       ["organisation_name", "formation_date"],
            "certificate_of_incorporation": ["company_name", "cin", "incorporation_date"],
            "gst_certificate":              ["gstin", "legal_name", "registration_date"],
            "aadhaar":                      ["name", "dob", "aadhaar_number"],
            "address_proof":                ["name", "address", "proof_type"],
            "board_resolution":             ["company_name", "resolution_date", "purpose"],
            "voter_id":                     ["name", "epic_number"],
            "driving_license":              ["name", "license_number", "valid_until"],
        }
        for doc_type, fields in required.items():
            doc_data = docs.get(doc_type)
            if not doc_data:
                continue
            for f in fields:
                if not doc_data.get(f):
                    flags.append(Flag("ERROR", "REQUIRED_FIELD", f"Could not extract '{f}' from {doc_type.replace('_',' ').title()}", f, doc_type))
        return flags

    # ─────────────────────────────────────────
    # EXPIRY CHECKS
    # ─────────────────────────────────────────

    def _check_expiry(self, docs):
        flags  = []
        today  = datetime.today()
        checks = [
            ("registration_certificate", "valid_until", "Registration Certificate"),
            ("fcra",                     "valid_until", "FCRA Certificate"),
            ("gst_certificate",          "valid_until", "GST Certificate"),
            ("driving_license",          "valid_until", "Driving License"),
        ]
        for doc_type, date_field, label in checks:
            doc_data = docs.get(doc_type)
            if not doc_data:
                continue
            date_str = doc_data.get(date_field)
            if not date_str:
                continue
            try:
                expiry    = dateparser.parse(date_str, dayfirst=True)
                days_diff = (expiry - today).days
                if days_diff < 0:
                    flags.append(Flag("ERROR",   "EXPIRY_CHECK", f"{label} expired {abs(days_diff)} days ago ({date_str})", date_field, doc_type))
                elif days_diff < 90:
                    flags.append(Flag("WARNING", "EXPIRY_CHECK", f"{label} expires in {days_diff} days ({date_str})", date_field, doc_type))
                else:
                    flags.append(Flag("INFO",    "EXPIRY_CHECK", f"{label} valid until {date_str}", date_field, doc_type))
            except Exception:
                flags.append(Flag("WARNING", "EXPIRY_CHECK", f"Could not parse expiry date '{date_str}' in {label} — verify manually", date_field, doc_type))
        return flags

    # ─────────────────────────────────────────
    # CROSS DOCUMENT NAME CONSISTENCY
    # ─────────────────────────────────────────

    def _check_name_consistency(self, docs):
        flags       = []
        # maps doc_type → field that holds the entity/person name
        name_fields = {
            # individual identity docs
            "pan":                          "name",
            "aadhaar":                      "name",
            "voter_id":                     "name",
            "driving_license":              "name",
            # organisation docs
            "registration_certificate":     "organisation_name",
            "fcra":                         "organisation_name",
            "audit_report":                 "organisation_name",
            "trust_deed":                   "organisation_name",
            "incorporation_document":       "organisation_name",
            "certificate_of_incorporation": "company_name",
            "gst_certificate":              "legal_name",
            "address_proof":                "name",
            "board_resolution":             "company_name",
        }

        name_sources = {}
        for doc_type, field_name in name_fields.items():
            doc_data = docs.get(doc_type)
            if doc_data and doc_data.get(field_name):
                name_sources[doc_type] = doc_data[field_name].upper().strip()

        if len(name_sources) < 2:
            return flags

        sources = list(name_sources.items())
        for i in range(len(sources)):
            for j in range(i + 1, len(sources)):
                doc1, name1 = sources[i]
                doc2, name2 = sources[j]
                similarity  = _embedding_similarity(name1, name2)
                label1      = doc1.replace("_", " ").title()
                label2      = doc2.replace("_", " ").title()

                if similarity < self.NAME_MATCH_THRESHOLD_MIN:
                    flags.append(Flag("ERROR",   "NAME_MISMATCH", f"Name mismatch: {label1} ('{name1}') vs {label2} ('{name2}') — {similarity}% match", "name", f"{doc1} vs {doc2}"))
                elif similarity < self.NAME_MATCH_THRESHOLD_MAX:
                    flags.append(Flag("WARNING", "NAME_MISMATCH", f"Slight name variation: {label1} vs {label2} — {similarity}% match — verify manually", "name", f"{doc1} vs {doc2}"))
                else:
                    flags.append(Flag("INFO",    "NAME_MATCH",    f"Name consistent: {label1} vs {label2} — {similarity}% match", "name", f"{doc1} vs {doc2}"))
        return flags

    # ─────────────────────────────────────────
    # DATE LOGIC
    # ─────────────────────────────────────────

    def _check_date_logic(self, docs):
        flags = []
        today = datetime.today()

        def parse(d):
            try:
                return dateparser.parse(d, dayfirst=True) if d else None
            except Exception:
                return None

        # fcra must be after registration
        reg_date  = parse(docs.get("registration_certificate", {}).get("registration_date"))
        fcra_date = parse(docs.get("fcra", {}).get("registration_date"))
        if reg_date and fcra_date and fcra_date < reg_date:
            flags.append(Flag("ERROR", "DATE_LOGIC", "FCRA registration date is before organisation registration date — suspicious", "registration_date", "fcra vs registration_certificate"))

        # audit report should not be older than 3 years
        audit_fy = docs.get("audit_report", {}).get("financial_year")
        if audit_fy:
            fy_match = re.search(r"(20\d{2})", audit_fy)
            if fy_match and today.year - int(fy_match.group(1)) > 3:
                flags.append(Flag("WARNING", "DATE_LOGIC", f"Audit report FY {audit_fy} is more than 3 years old", "financial_year", "audit_report"))

        # certificate of incorporation must be before gst registration
        coi_date = parse(docs.get("certificate_of_incorporation", {}).get("incorporation_date"))
        gst_date = parse(docs.get("gst_certificate", {}).get("registration_date"))
        if coi_date and gst_date and gst_date < coi_date:
            flags.append(Flag("ERROR", "DATE_LOGIC", "GST registration date is before company incorporation date — suspicious", "registration_date", "gst_certificate vs certificate_of_incorporation"))

        # driving license issue date must be before expiry
        dl_issue  = parse(docs.get("driving_license", {}).get("issue_date"))
        dl_expiry = parse(docs.get("driving_license", {}).get("valid_until"))
        if dl_issue and dl_expiry and dl_expiry <= dl_issue:
            flags.append(Flag("ERROR", "DATE_LOGIC", "Driving license expiry date is before or same as issue date — invalid", "valid_until", "driving_license"))

        # board resolution must not be in future
        br_date = parse(docs.get("board_resolution", {}).get("resolution_date"))
        if br_date and br_date > today:
            flags.append(Flag("ERROR", "DATE_LOGIC", "Board resolution date is in the future — invalid", "resolution_date", "board_resolution"))

        return flags

    # ─────────────────────────────────────────
    # SUMMARY
    # ─────────────────────────────────────────

    def _summarise(self, flags):
        errors   = sum(1 for f in flags if f.severity == "ERROR")
        warnings = sum(1 for f in flags if f.severity == "WARNING")
        if errors == 0 and warnings == 0:
            return "✅ All checks passed — ready for review"
        elif errors > 0:
            return f"❌ {errors} error(s) found — must review before approving"
        return f"⚠️ {warnings} warning(s) — should verify manually"