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
#   certificate_of_incorporation
#   gst_certificate
#   aadhaar
#   address_proof
#   board_resolution
#   voter_id
#   driving_license
#   bank_statement
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
# NEW EXTRACTORS
# ─────────────────────────────────────────────

class CertificateOfIncorporationExtractor:

    def extract(self, text: str) -> dict:
        return {
            "document_type":       "CERTIFICATE_OF_INCORPORATION",
            "company_name":        self._company_name(text),
            "cin":                 self._cin(text),
            "incorporation_date":  self._date(text),
            "registered_address":  self._address(text),
            "company_type":        self._company_type(text),
        }

    def _company_name(self, text):
        m = re.search(r"(?:name\s*of\s*(?:the\s*)?company|company\s*name)\s*[:\-]?\s*([A-Z][A-Z\s&\.\-]+(?:LIMITED|LTD|PVT|PRIVATE|LLP|INDIA)?)", text, re.IGNORECASE)
        if m: return m.group(1).strip().title()
        m = re.search(r"([A-Z][A-Z\s]+(?:LIMITED|LTD|PRIVATE LIMITED|PVT LTD|LLP))", text)
        return m.group(1).strip().title() if m else None

    def _cin(self, text):
        # CIN format: L/U + 5 digits + 2 letters + 4 digits + 3 letters + 6 digits
        m = re.search(r"\b([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b", text)
        return m.group(1) if m else None

    def _date(self, text):
        m = re.search(r"(?:date\s*of\s*incorporation|incorporated\s*on|incorporation\s*date)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _address(self, text):
        m = re.search(r"(?:registered\s*office|registered\s*address|address)\s*[:\-]?\s*([A-Za-z0-9\s,\.\-\/]+\d{6})", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _company_type(self, text):
        if re.search(r"private\s*limited|pvt\.?\s*ltd", text, re.IGNORECASE): return "Private Limited"
        if re.search(r"public\s*limited",               text, re.IGNORECASE): return "Public Limited"
        if re.search(r"\bllp\b",                        text, re.IGNORECASE): return "LLP"
        if re.search(r"section\s*8|section\s*25",       text, re.IGNORECASE): return "Section 8"
        return None


class GSTCertificateExtractor:

    def extract(self, text: str) -> dict:
        return {
            "document_type":      "GST_CERTIFICATE",
            "gstin":              self._gstin(text),
            "legal_name":         self._legal_name(text),
            "trade_name":         self._trade_name(text),
            "registration_date":  self._reg_date(text),
            "valid_until":        self._valid_until(text),
            "state":              self._state(text),
            "pan":                self._pan(text),
        }

    def _gstin(self, text):
        # GSTIN: 2 digits state + 10 char PAN + 1 digit entity + Z + 1 checksum
        m = re.search(r"\b(\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}Z[A-Z0-9]{1})\b", text)
        return m.group(1) if m else None

    def _legal_name(self, text):
        m = re.search(r"(?:legal\s*name\s*of\s*(?:the\s*)?(?:business|entity)|legal\s*name)\s*[:\-]?\s*([A-Za-z\s&\.\-]+)", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _trade_name(self, text):
        m = re.search(r"(?:trade\s*name|business\s*name)\s*[:\-]?\s*([A-Za-z\s&\.\-]+)", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _reg_date(self, text):
        m = re.search(r"(?:date\s*of\s*registration|registered\s*on|effective\s*date)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _valid_until(self, text):
        m = re.search(r"(?:valid\s*(?:upto|until|till)|expiry\s*date)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _state(self, text):
        # first 2 digits of GSTIN = state code
        m = re.search(r"\b(\d{2})[A-Z]{5}\d{4}[A-Z]\dZ[A-Z0-9]", text)
        state_codes = {
            "01":"Jammu & Kashmir","02":"Himachal Pradesh","03":"Punjab","04":"Chandigarh",
            "05":"Uttarakhand","06":"Haryana","07":"Delhi","08":"Rajasthan","09":"Uttar Pradesh",
            "10":"Bihar","11":"Sikkim","12":"Arunachal Pradesh","13":"Nagaland","14":"Manipur",
            "15":"Mizoram","16":"Tripura","17":"Meghalaya","18":"Assam","19":"West Bengal",
            "20":"Jharkhand","21":"Odisha","22":"Chhattisgarh","23":"Madhya Pradesh",
            "24":"Gujarat","27":"Maharashtra","29":"Karnataka","30":"Goa","32":"Kerala",
            "33":"Tamil Nadu","36":"Telangana","37":"Andhra Pradesh",
        }
        return state_codes.get(m.group(1)) if m else None

    def _pan(self, text):
        gstin = re.search(r"\b\d{2}([A-Z]{5}\d{4}[A-Z])\dZ[A-Z0-9]", text)
        if gstin: return gstin.group(1)
        m = re.search(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", text)
        return m.group(1) if m else None


class AadhaarExtractor:

    def extract(self, text: str) -> dict:
        return {
            "document_type": "AADHAAR",
            "name":          self._name(text),
            "dob":           self._dob(text),
            "gender":        self._gender(text),
            "aadhaar_number": self._aadhaar(text),
            "address":       self._address(text),
        }

    def _aadhaar(self, text):
        # Aadhaar: 12 digits, often shown as XXXX XXXX 1234 (last 4 visible)
        m = re.search(r"\b(\d{4}\s?\d{4}\s?\d{4})\b", text)
        if m: return m.group(1).replace(" ", "")
        # masked format
        m = re.search(r"(?:xxxx\s?xxxx\s?)(\d{4})", text, re.IGNORECASE)
        return f"XXXX XXXX {m.group(1)}" if m else None

    def _name(self, text):
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        for i, line in enumerate(lines):
            if re.search(r"^name\s*[:\-]?\s*$", line, re.IGNORECASE):
                if i + 1 < len(lines): return lines[i + 1].title()
        m = re.search(r"(?:name|नाम)\s*[:\-]?\s*([A-Za-z\s\.]+)", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _dob(self, text):
        m = re.search(r"(?:dob|date\s*of\s*birth|जन्म\s*तिथि)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _gender(self, text):
        if re.search(r"\bMALE\b",   text, re.IGNORECASE): return "Male"
        if re.search(r"\bFEMALE\b", text, re.IGNORECASE): return "Female"
        if re.search(r"\bOTHER\b",  text, re.IGNORECASE): return "Other"
        return None

    def _address(self, text):
        m = re.search(r"(?:address|पता)\s*[:\-]?\s*([A-Za-z0-9\s,\.\-\/]+\d{6})", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None


class AddressProofExtractor:

    def extract(self, text: str) -> dict:
        return {
            "document_type":  "ADDRESS_PROOF",
            "proof_type":     self._proof_type(text),
            "name":           self._name(text),
            "address":        self._address(text),
            "issue_date":     self._date(text),
            "account_number": self._account_number(text),
        }

    def _proof_type(self, text):
        if re.search(r"electricity|electric\s*bill|power\s*bill|BESCOM|MSEDCL|TNEB", text, re.IGNORECASE): return "Electricity Bill"
        if re.search(r"bank\s*(?:statement|letter|certificate)",                       text, re.IGNORECASE): return "Bank Letter"
        if re.search(r"rent\s*(?:agreement|deed|receipt)",                             text, re.IGNORECASE): return "Rent Agreement"
        if re.search(r"telephone|broadband|internet\s*bill",                          text, re.IGNORECASE): return "Telephone Bill"
        if re.search(r"gas\s*bill|lpg",                                               text, re.IGNORECASE): return "Gas Bill"
        return "Other"

    def _name(self, text):
        m = re.search(r"(?:name\s*of\s*(?:consumer|subscriber|account\s*holder|tenant|owner)|consumer\s*name)\s*[:\-]?\s*([A-Za-z\s\.]+)", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _address(self, text):
        m = re.search(r"(?:address|premises|installation\s*address)\s*[:\-]?\s*([A-Za-z0-9\s,\.\-\/]+\d{6})", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _date(self, text):
        m = re.search(r"(?:bill\s*date|statement\s*date|issue\s*date|dated)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _account_number(self, text):
        m = re.search(r"(?:account\s*(?:no|number)|consumer\s*(?:no|number))\s*[:\-]?\s*([A-Z0-9\-\/]{5,})", text, re.IGNORECASE)
        return m.group(1).strip() if m else None


class BoardResolutionExtractor:

    def extract(self, text: str) -> dict:
        return {
            "document_type":   "BOARD_RESOLUTION",
            "company_name":    self._company_name(text),
            "resolution_date": self._date(text),
            "resolution_number": self._resolution_number(text),
            "authorised_persons": self._authorised_persons(text),
            "purpose":         self._purpose(text),
        }

    def _company_name(self, text):
        m = re.search(r"(?:meeting\s*of\s*(?:the\s*)?(?:board|directors)\s*of)\s*([A-Z][A-Z\s&\.\-]+(?:LIMITED|LTD|LLP|PVT)?)", text, re.IGNORECASE)
        if m: return m.group(1).strip().title()
        m = re.search(r"([A-Z][A-Z\s]+(?:LIMITED|LTD|PRIVATE\s*LIMITED|PVT\s*LTD|LLP))", text)
        return m.group(1).strip().title() if m else None

    def _date(self, text):
        m = re.search(r"(?:held\s*on|date\s*of\s*meeting|meeting\s*date|dated)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _resolution_number(self, text):
        m = re.search(r"(?:resolution\s*(?:no|number))\s*[:\-]?\s*([A-Z0-9\/\-]+)", text, re.IGNORECASE)
        return m.group(1).strip() if m else None

    def _authorised_persons(self, text):
        persons = re.findall(r"(?:authoris(?:e|ed|ing)|authoriz(?:e|ed|ing))\s+(?:Mr\.?|Ms\.?|Mrs\.?|Dr\.?)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)", text)
        return [p.strip() for p in persons] if persons else None

    def _purpose(self, text):
        m = re.search(r"(?:resolved\s*that|purpose\s*[:\-]?)\s*([A-Za-z\s,\.\-]+)", text, re.IGNORECASE)
        return m.group(1).strip()[:200] if m else None


class VoterIDExtractor:

    def extract(self, text: str) -> dict:
        return {
            "document_type":  "VOTER_ID",
            "name":           self._name(text),
            "fathers_name":   self._fathers_name(text),
            "dob":            self._dob(text),
            "gender":         self._gender(text),
            "epic_number":    self._epic(text),
            "address":        self._address(text),
        }

    def _epic(self, text):
        # EPIC number: 3 letters + 7 digits
        m = re.search(r"\b([A-Z]{3}[0-9]{7})\b", text)
        return m.group(1) if m else None

    def _name(self, text):
        m = re.search(r"(?:elector(?:\'s)?\s*name|name)\s*[:\-]?\s*([A-Za-z\s\.]+)", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _fathers_name(self, text):
        m = re.search(r"(?:father(?:\'s)?\s*name|husband(?:\'s)?\s*name|relation(?:\'s)?\s*name)\s*[:\-]?\s*([A-Za-z\s\.]+)", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _dob(self, text):
        m = re.search(r"(?:dob|date\s*of\s*birth|age)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _gender(self, text):
        if re.search(r"\bMALE\b",   text, re.IGNORECASE): return "Male"
        if re.search(r"\bFEMALE\b", text, re.IGNORECASE): return "Female"
        return None

    def _address(self, text):
        m = re.search(r"(?:address|residential\s*address)\s*[:\-]?\s*([A-Za-z0-9\s,\.\-\/]+\d{6})", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None


class DrivingLicenseExtractor:

    def extract(self, text: str) -> dict:
        return {
            "document_type":   "DRIVING_LICENSE",
            "name":            self._name(text),
            "dob":             self._dob(text),
            "license_number":  self._license_number(text),
            "issue_date":      self._issue_date(text),
            "valid_until":     self._valid_until(text),
            "vehicle_classes": self._vehicle_classes(text),
            "address":         self._address(text),
        }

    def _license_number(self, text):
        # DL format: state code (2 letters) + RTO (2 digits) + year (4 digits) + 7 digits
        m = re.search(r"\b([A-Z]{2}[-\s]?\d{2}[-\s]?\d{4}[-\s]?\d{7})\b", text)
        if m: return m.group(1).replace(" ", "").replace("-", "")
        m = re.search(r"(?:dl\s*(?:no|number)|licence\s*(?:no|number)|license\s*(?:no|number))\s*[:\-]?\s*([A-Z0-9\-\/\s]{8,})", text, re.IGNORECASE)
        return m.group(1).strip().replace(" ", "") if m else None

    def _name(self, text):
        m = re.search(r"(?:name\s*of\s*(?:the\s*)?holder|name)\s*[:\-]?\s*([A-Za-z\s\.]+)", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _dob(self, text):
        m = re.search(r"(?:dob|date\s*of\s*birth)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _issue_date(self, text):
        m = re.search(r"(?:date\s*of\s*issue|issue\s*date|issued\s*on)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _valid_until(self, text):
        m = re.search(r"(?:valid\s*(?:upto|until|till)|expiry\s*date|validity)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})", text, re.IGNORECASE)
        return m.group(1) if m else None

    def _vehicle_classes(self, text):
        classes = re.findall(r"\b(MCWG|MCWOG|LMV|HMV|HTV|PSV|MGV|TRANS|NT)\b", text)
        return classes if classes else None

    def _address(self, text):
        m = re.search(r"(?:address|permanent\s*address)\s*[:\-]?\s*([A-Za-z0-9\s,\.\-\/]+\d{6})", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None





class BankStatementExtractor:
    """
    extracts fields from bank statements — PDF or image
    applies to individual, NGO, and company accounts
    rule engine checks statement period is within last 6 months
    """

    def extract(self, text: str) -> dict:
        return {
            "document_type":    "BANK_STATEMENT",
            "account_holder":   self._account_holder(text),
            "account_number":   self._account_number(text),
            "bank_name":        self._bank_name(text),
            "ifsc_code":        self._ifsc(text),
            "account_type":     self._account_type(text),
            "statement_from":   self._period_from(text),
            "statement_to":     self._period_to(text),
            "opening_balance":  self._opening_balance(text),
            "closing_balance":  self._closing_balance(text),
        }

    def _account_holder(self, text):
        m = re.search(
            r"(?:account\s*holder|name\s*of\s*(?:account\s*holder|customer)|customer\s*name|account\s*name)\s*[:\-]?\s*([A-Za-z\s\.]+)",
            text, re.IGNORECASE
        )
        return m.group(1).strip().upper() if m else None

    def _account_number(self, text):
        # mask middle digits — show only last 4
        m = re.search(
            r"(?:account\s*(?:no|number|num)|a\/c\s*(?:no|number))\s*[:\-]?\s*([X\*\d][\dX\*\s]{6,18}\d{4})",
            text, re.IGNORECASE
        )
        if m:
            raw = re.sub(r"\s", "", m.group(1))
            if len(raw) > 4:
                return "X" * (len(raw) - 4) + raw[-4:]
            return raw
        return None

    def _bank_name(self, text):
        banks = [
            "STATE BANK OF INDIA", "SBI", "HDFC BANK", "ICICI BANK",
            "AXIS BANK", "KOTAK MAHINDRA BANK", "PUNJAB NATIONAL BANK", "PNB",
            "BANK OF BARODA", "CANARA BANK", "UNION BANK", "IDBI BANK",
            "YES BANK", "INDUSIND BANK", "FEDERAL BANK", "UCO BANK",
            "CENTRAL BANK OF INDIA", "INDIAN BANK", "BANK OF INDIA",
            "INDIAN OVERSEAS BANK", "BANDHAN BANK", "AU SMALL FINANCE BANK",
        ]
        text_upper = text.upper()
        for bank in banks:
            if bank in text_upper:
                return bank.title()
        # fallback — look for "BANK" keyword near a name
        m = re.search(r"([A-Z][A-Za-z\s]+BANK(?:\s+LIMITED|\s+LTD)?)", text, re.IGNORECASE)
        return m.group(1).strip().title() if m else None

    def _ifsc(self, text):
        m = re.search(r"\b([A-Z]{4}0[A-Z0-9]{6})\b", text)
        return m.group(1) if m else None

    def _account_type(self, text):
        if re.search(r"\bsavings\b",  text, re.IGNORECASE): return "Savings"
        if re.search(r"\bcurrent\b",  text, re.IGNORECASE): return "Current"
        if re.search(r"\bsalary\b",   text, re.IGNORECASE): return "Salary"
        if re.search(r"\boverdraft\b", text, re.IGNORECASE): return "Overdraft"
        return None

    def _period_from(self, text):
        m = re.search(
            r"(?:statement\s*(?:period|from)|from\s*date|period\s*from)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})",
            text, re.IGNORECASE
        )
        if m: return m.group(1)
        # fallback — first date in document
        dates = re.findall(r"\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b", text)
        return dates[0] if dates else None

    def _period_to(self, text):
        m = re.search(
            r"(?:statement\s*(?:period\s*to|to)|to\s*date|period\s*to)\s*[:\-]?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})",
            text, re.IGNORECASE
        )
        if m: return m.group(1)
        # fallback — last date in document
        dates = re.findall(r"\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b", text)
        return dates[-1] if len(dates) > 1 else None

    def _opening_balance(self, text):
        m = re.search(
            r"(?:opening\s*balance|opening\s*bal)\s*[:\-]?\s*(?:Rs\.?|INR)?\s*([\d,]+\.?\d{0,2})",
            text, re.IGNORECASE
        )
        return m.group(1).replace(",", "") if m else None

    def _closing_balance(self, text):
        m = re.search(
            r"(?:closing\s*balance|closing\s*bal)\s*[:\-]?\s*(?:Rs\.?|INR)?\s*([\d,]+\.?\d{0,2})",
            text, re.IGNORECASE
        )
        return m.group(1).replace(",", "") if m else None


# ─────────────────────────────────────────────
# updated registry — all 14 doc types
# ─────────────────────────────────────────────

EXTRACTORS = {
    "pan":                          PANExtractor(),
    "registration_certificate":     RegistrationCertificateExtractor(),
    "fcra":                         FCRAExtractor(),
    "audit_report":                 AuditReportExtractor(),
    "trust_deed":                   TrustDeedExtractor(),
    "incorporation_document":       IncorporationDocumentExtractor(),
    "certificate_of_incorporation": CertificateOfIncorporationExtractor(),
    "gst_certificate":              GSTCertificateExtractor(),
    "aadhaar":                      AadhaarExtractor(),
    "address_proof":                AddressProofExtractor(),
    "board_resolution":             BoardResolutionExtractor(),
    "voter_id":                     VoterIDExtractor(),
    "driving_license":              DrivingLicenseExtractor(),
    "bank_statement":               BankStatementExtractor(),
}


def get_extractor(doc_type: str):
    extractor = EXTRACTORS.get(doc_type)
    if not extractor:
        raise ValueError(f"no extractor for doc_type '{doc_type}'. valid: {list(EXTRACTORS.keys())}")
    return extractor