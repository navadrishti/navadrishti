# ─────────────────────────────────────────────
# ocr/extractors.py
# one extractor class per document type
# each takes raw OCR full_text string
# and returns a structured fields dict
#
# document types:
#   pan
#   registration_certificate
#   fcra
#   audit_report
#   trust_deed
#   incorporation_document
# ─────────────────────────────────────────────

import re


class PANExtractor:

    def extract(self, text: str) -> dict:
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        return {
            "document_type": "PAN",
            "pan_number":    self._pan_number(text),
            "name":          self._name(lines),
            "fathers_name":  self._fathers_name(lines),
            "dob_or_doi":    self._date(text),
            "pan_type":      self._pan_type(text),
        }

    def _pan_number(self, text):
        m = re.search(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", text)
        return m.group(1) if m else None

    def _date(self, text):
        m = re.search(r"\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b", text)
        return m.group(1) if m else None

    def _pan_type(self, text):
        pan = re.search(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", text)
        if pan:
            letter = pan.group(1)[3]
            return {
                "P": "individual", "C": "company",
                "H": "huf",        "F": "firm",
                "T": "trust",      "B": "body_of_individuals",
            }.get(letter, "other")
        return None

    def _name(self, lines):
        # strategy 1: look for label
        for i, line in enumerate(lines):
            if re.search(r"^name\s*[:\-]?\s*$", line, re.IGNORECASE):
                if i + 1 < len(lines):
                    return lines[i + 1].title()
        # strategy 2: position-based — first clean non-header line
        skip = {"income tax department", "government of india", "permanent account number", "signature"}
        pan  = re.compile(r"[A-Z]{5}[0-9]{4}[A-Z]")
        date = re.compile(r"\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}")
        candidates = []
        for line in lines:
            cl = line.strip()
            if not cl: continue
            if cl.lower() in skip: continue
            if pan.search(cl): continue
            if date.search(cl): continue
            if re.search(r"(father|name|birth|date|sign)", cl, re.IGNORECASE): continue
            if re.match(r"^[A-Za-z\s\.]+$", cl) and len(cl) > 3:
                candidates.append(cl.title())
        return candidates[0] if candidates else None

    def _fathers_name(self, lines):
        for i, line in enumerate(lines):
            if re.search(r"father", line, re.IGNORECASE):
                if i + 1 < len(lines):
                    return lines[i + 1].title()
        candidates = []
        skip = {"income tax department", "government of india", "signature"}
        pan  = re.compile(r"[A-Z]{5}[0-9]{4}[A-Z]")
        date = re.compile(r"\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}")
        for line in lines:
            cl = line.strip()
            if not cl: continue
            if cl.lower() in skip: continue
            if pan.search(cl): continue
            if date.search(cl): continue
            if re.search(r"(father|name|birth|date|sign)", cl, re.IGNORECASE): continue
            if re.match(r"^[A-Za-z\s\.]+$", cl) and len(cl) > 3:
                candidates.append(cl.title())
        return candidates[1] if len(candidates) > 1 else None


class RegistrationCertificateExtractor:

    def extract(self, text: str) -> dict:
        return {
            "document_type":       "REGISTRATION_CERTIFICATE",
            "organisation_name":   self._org_name(text),
            "registration_number": self._reg_number(text),
            "registration_date":   self._reg_date(text),
            "valid_until":         self._valid_until(text),
            "issuing_authority":   self._issuing_authority(text),
        }

    def _org_name(self, text):
        m = re.search(r"(?:name\s*(?:of\s*(?:the\s*)?(?:organisation|society|trust|ngo))?)\s*[:\-]?\s*([A-Z][A-Z\s&\.\-]+)", text, re.IGNORECASE)
        if m: return m.group(1).strip().title()
        m = re.search(r"([A-Z][A-Z\s]+(?:FOUNDATION|TRUST|SOCIETY|NGO|CHARITABLE|WELFARE|SANSTHAN))", text)
        return m.group(1).strip().title() if m else None

    def _reg_number(self, text):
        m = re.search(r"(?:registration\s*(?:no|number|#)?\s*[:\-]?\s*)([A-Z0-9\/\-]{5,})", text, re.IGNORECASE)
        return m.group(1).strip() if m else None

    def _reg_date(self, text):
        m = re.search(r"(?:registration\s*date|registered\s*on|date\s*of\s*registration)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _valid_until(self, text):
        m = re.search(r"(?:valid\s*(?:upto|until|till)|expiry\s*date|expires\s*on)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _issuing_authority(self, text):
        m = re.search(r"(?:issued\s*by|registrar\s*of|issuing\s*authority)\s*[:\-]?\s*([A-Za-z\s,]+)", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None


class FCRAExtractor:

    def extract(self, text: str) -> dict:
        return {
            "document_type":    "FCRA",
            "organisation_name": self._org_name(text),
            "fcra_number":       self._fcra_number(text),
            "registration_date": self._date(text, "registration"),
            "valid_until":       self._date(text, "valid"),
            "pan":               self._pan(text),
        }

    def _org_name(self, text):
        m = re.search(r"(?:name\s*(?:of\s*(?:the\s*)?(?:organisation|association|body))?)\s*[:\-]?\s*([A-Z][A-Z\s&\.\-]+)", text, re.IGNORECASE)
        if m: return m.group(1).strip().title()
        m = re.search(r"([A-Z][A-Z\s]+(?:FOUNDATION|TRUST|SOCIETY|NGO|CHARITABLE|WELFARE))", text)
        return m.group(1).strip().title() if m else None

    def _fcra_number(self, text):
        m = re.search(r"(?:fcra\s*(?:no|number|registration\s*no)?\s*[:\-]?\s*)(\d{9})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _date(self, text, kind):
        if kind == "registration":
            m = re.search(r"(?:date\s*of\s*registration|registered\s*on)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        else:
            m = re.search(r"(?:valid\s*(?:upto|until|till)|expiry|expires)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _pan(self, text):
        m = re.search(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", text)
        return m.group(1) if m else None


class AuditReportExtractor:

    def extract(self, text: str) -> dict:
        return {
            "document_type":      "AUDIT_REPORT",
            "organisation_name":  self._org_name(text),
            "pan":                self._pan(text),
            "financial_year":     self._financial_year(text),
            "auditor_name":       self._auditor_name(text),
            "auditor_reg_number": self._auditor_reg(text),
        }

    def _org_name(self, text):
        m = re.search(r"(?:name\s*of\s*(?:the\s*)?(?:organisation|trust|society|company|ngo))\s*[:\-]?\s*([A-Z][A-Z\s&\.\-]+)", text, re.IGNORECASE)
        if m: return m.group(1).strip().title()
        m = re.search(r"([A-Z][A-Z\s]+(?:FOUNDATION|TRUST|SOCIETY|NGO|CHARITABLE))", text)
        return m.group(1).strip().title() if m else None

    def _pan(self, text):
        m = re.search(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", text)
        return m.group(1) if m else None

    def _financial_year(self, text):
        m = re.search(r"(20\d{2}\s*[\-\/]\s*\d{2,4})", text)
        return m.group(1).replace(" ", "") if m else None

    def _auditor_name(self, text):
        m = re.search(r"(?:ca\.?|chartered\s*accountant)\s+([A-Za-z\s\.]+)", text, re.IGNORECASE)
        if m: return "CA " + m.group(1).strip().title()
        m = re.search(r"(?:auditor(?:\'s)?\s*(?:name)?)\s*[:\-]?\s*([A-Za-z\s\.]+)", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _auditor_reg(self, text):
        m = re.search(r"(?:membership\s*(?:no|number)|registration\s*(?:no|number)|m\.?\s*no)\s*[:\-]?\s*(\d{5,7})", text, re.IGNORECASE)
        return m.group(1) if m else None


class TrustDeedExtractor:

    def extract(self, text: str) -> dict:
        return {
            "document_type":       "TRUST_DEED",
            "organisation_name":   self._org_name(text),
            "formation_date":      self._formation_date(text),
            "registered_address":  self._address(text),
            "registration_number": self._reg_number(text),
        }

    def _org_name(self, text):
        m = re.search(r"(?:name\s*of\s*(?:the\s*)?trust)\s*[:\-]?\s*([A-Z][A-Z\s&\.\-]+)", text, re.IGNORECASE)
        if m: return m.group(1).strip().title()
        m = re.search(r"([A-Z][A-Z\s]+(?:FOUNDATION|TRUST|SOCIETY|CHARITABLE))", text)
        return m.group(1).strip().title() if m else None

    def _formation_date(self, text):
        m = re.search(r"(?:formation\s*date|formed\s*on|established\s*on|date\s*of\s*formation)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _address(self, text):
        m = re.search(r"(?:registered\s*address|address)\s*[:\-]?\s*([A-Za-z0-9\s,\.\-\/]+(?:bangalore|mumbai|delhi|chennai|hyderabad|kolkata|pune|[a-z]+\s*\d{6}))", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _reg_number(self, text):
        m = re.search(r"(?:registration\s*(?:no|number|#)?\s*[:\-]?\s*)([A-Z0-9\/\-]{5,})", text, re.IGNORECASE)
        return m.group(1).strip() if m else None


class IncorporationDocumentExtractor(TrustDeedExtractor):
    """same structure as trust deed — inherits all methods"""

    def extract(self, text: str) -> dict:
        result                  = super().extract(text)
        result["document_type"] = "INCORPORATION_DOCUMENT"
        return result


# ─────────────────────────────────────────────
# registry
# ─────────────────────────────────────────────

EXTRACTORS = {
    "pan":                      PANExtractor(),
    "registration_certificate": RegistrationCertificateExtractor(),
    "fcra":                     FCRAExtractor(),
    "audit_report":             AuditReportExtractor(),
    "trust_deed":               TrustDeedExtractor(),
    "incorporation_document":   IncorporationDocumentExtractor(),
}


def get_extractor(doc_type: str):
    extractor = EXTRACTORS.get(doc_type)
    if not extractor:
        raise ValueError(f"no extractor for doc_type '{doc_type}'. valid: {list(EXTRACTORS.keys())}")
    return extractor