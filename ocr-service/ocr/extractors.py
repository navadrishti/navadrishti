import re
from dataclasses import dataclass, asdict, field
from typing import Optional


class BaseExtractor:

    def _lines(self, text):
        return [l.strip() for l in text.split("\n") if l.strip()]

    def _after_colon(self, line):
        parts = line.split(":", 1)
        return parts[1].strip() if len(parts) > 1 and parts[1].strip() else None

    def _find_pan(self, text):
        m = re.search(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", text)
        return m.group(1) if m else None

    def _find_date(self, text):
        m = re.search(r"\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b", text)
        return m.group(1) if m else None

    def _clean_name(self, name):
        return re.sub(r"[^A-Za-z\s\.\-]", "", name).strip().title()

    def to_dict(self, obj):
        return {k: v for k, v in asdict(obj).items()}


@dataclass
class RegistrationCertData:
    document_type:       str           = "REGISTRATION_CERTIFICATE"
    organisation_name:   Optional[str] = None
    registration_number: Optional[str] = None
    registration_date:   Optional[str] = None
    issuing_authority:   Optional[str] = None
    registered_address:  Optional[str] = None
    valid_until:         Optional[str] = None


class RegistrationCertExtractor(BaseExtractor):

    def extract(self, text):
        data       = RegistrationCertData()
        lines      = self._lines(text)
        addr_lines = []
        collecting = False

        for line in lines:
            ll = line.lower()

            if re.search(r"(organisation|organization|company|trust|society)\s*(name)?\s*[:\-]", line, re.I):
                val = self._after_colon(line)
                if val and not data.organisation_name:
                    data.organisation_name = self._clean_name(val)

            if re.search(r"reg(istration)?\s*(no|number|#)\s*[:\-]", line, re.I):
                val = self._after_colon(line)
                if val and not data.registration_number:
                    data.registration_number = val.strip()

            cin = re.search(r"\b([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b", line)
            if cin and not data.registration_number:
                data.registration_number = cin.group(1)

            if re.search(r"(registration|incorporation|established)\s*date\s*[:\-]", line, re.I):
                if not data.registration_date:
                    data.registration_date = self._find_date(line)

            if re.search(r"(valid|validity|expiry|expires?)\s*(until|upto|date)?\s*[:\-]", line, re.I):
                if not data.valid_until:
                    data.valid_until = self._find_date(line)

            if re.search(r"(issued?\s*by|authority|registrar)\s*[:\-]", line, re.I):
                val = self._after_colon(line)
                if val and not data.issuing_authority:
                    data.issuing_authority = val.strip()

            if re.search(r"(registered\s*)?(office\s*|address)\s*[:\-]", line, re.I):
                val = self._after_colon(line)
                if val:
                    addr_lines.append(val)
                collecting = True
                continue

            if collecting:
                if re.search(r"\w+\s*[:\-]", line):
                    collecting = False
                else:
                    addr_lines.append(line)

        if addr_lines:
            data.registered_address = " ".join(addr_lines)

        return self.to_dict(data)


@dataclass
class PANData:
    document_type: str           = "PAN"
    name:          Optional[str] = None
    fathers_name:  Optional[str] = None
    dob_or_doi:    Optional[str] = None
    pan_number:    Optional[str] = None
    pan_type:      Optional[str] = None


class PANExtractor(BaseExtractor):

    def extract(self, text):
        data  = PANData()
        lines = self._lines(text)

        for line in lines:
            pan = self._find_pan(line)
            if pan and not data.pan_number:
                data.pan_number = pan
                type_map = {"P": "individual", "C": "company", "F": "firm", "T": "trust"}
                data.pan_type = type_map.get(pan[3], "other")

            if re.search(r"(birth|dob|incorporation|doi)", line, re.I) and not data.dob_or_doi:
                data.dob_or_doi = self._find_date(line)

            if not data.dob_or_doi:
                date = self._find_date(line)
                if date:
                    data.dob_or_doi = date

        for line in lines:
            ll = line.lower()
            if re.search(r"\bname\s*[:\-]", line, re.I) and not data.name:
                val = self._after_colon(line)
                if val:
                    data.name = self._clean_name(val)
            if re.search(r"father", ll) and not data.fathers_name:
                val = self._after_colon(line)
                if val:
                    data.fathers_name = self._clean_name(val)

        if not data.name:
            content_lines = []
            for line in lines:
                if not re.match(r"^[A-Za-z\s]+$", line):
                    continue
                if re.search(r"income tax|government|signature|department|permanent account", line, re.I):
                    continue
                if re.search(r"[A-Z]{5}[0-9]{4}[A-Z]", line):
                    continue
                content_lines.append(line.strip())

            if len(content_lines) >= 1:
                data.name = self._clean_name(content_lines[0])
            if len(content_lines) >= 2 and not data.fathers_name:
                data.fathers_name = self._clean_name(content_lines[1])

        return self.to_dict(data)


@dataclass
class FCRAData:
    document_type:      str           = "FCRA_CERTIFICATE"
    organisation_name:  Optional[str] = None
    fcra_number:        Optional[str] = None
    registration_date:  Optional[str] = None
    valid_until:        Optional[str] = None
    pan:                Optional[str] = None
    address:            Optional[str] = None


class FCRAExtractor(BaseExtractor):

    def extract(self, text):
        data  = FCRAData()
        lines = self._lines(text)

        for line in lines:
            ll = line.lower()

            if re.search(r"(organisation|association|trust|society)\s*(name)?\s*[:\-]", line, re.I):
                val = self._after_colon(line)
                if val and not data.organisation_name:
                    data.organisation_name = self._clean_name(val)

            if re.search(r"fcra\s*(no|number|reg)\s*[:\-]", ll):
                val = self._after_colon(line)
                if val and not data.fcra_number:
                    data.fcra_number = re.sub(r"[^\d]", "", val)

            m = re.search(r"\b(\d{9})\b", line)
            if m and not data.fcra_number:
                data.fcra_number = m.group(1)

            date = self._find_date(line)
            if date:
                if re.search(r"(registration|granted|issued?)\s*(date|on)", ll):
                    data.registration_date = date
                elif re.search(r"(valid|expiry|renewal)\s*(until|upto|date)", ll):
                    data.valid_until = date

            pan = self._find_pan(line)
            if pan and not data.pan:
                data.pan = pan

            if re.search(r"(registered\s*)?address\s*[:\-]", ll) and not data.address:
                data.address = self._after_colon(line)

        return self.to_dict(data)


@dataclass
class AuditReportData:
    document_type:       str           = "AUDIT_REPORT"
    organisation_name:   Optional[str] = None
    pan:                 Optional[str] = None
    financial_year:      Optional[str] = None
    audit_date:          Optional[str] = None
    auditor_name:        Optional[str] = None
    auditor_reg_number:  Optional[str] = None


class AuditReportExtractor(BaseExtractor):

    def extract(self, text):
        data  = AuditReportData()
        lines = self._lines(text)

        for line in lines:
            ll = line.lower()

            if re.search(r"(name\s*of\s*(the\s*)?(trust|society|company|organisation|ngo))\s*[:\-]", line, re.I):
                val = self._after_colon(line)
                if val and not data.organisation_name:
                    data.organisation_name = self._clean_name(val)

            pan = self._find_pan(line)
            if pan and not data.pan:
                data.pan = pan

            fy = re.search(r"\b(20\d{2}[\-\/]2?\d{2})\b", line)
            if fy and not data.financial_year:
                data.financial_year = fy.group(1)

            if re.search(r"(audit|report)\s*(date|dated)\s*[:\-]", ll) and not data.audit_date:
                data.audit_date = self._find_date(line)

            if re.search(r"(auditor|chartered\s*accountant|ca)\s*(name)?\s*[:\-]", line, re.I) and not data.auditor_name:
                val = self._after_colon(line)
                if val:
                    data.auditor_name = self._clean_name(val)

            if re.search(r"(membership|reg(istration)?)\s*(no|number)\s*[:\-]", ll) and not data.auditor_reg_number:
                val = self._after_colon(line)
                if val:
                    data.auditor_reg_number = re.sub(r"[^\d]", "", val)

        return self.to_dict(data)


@dataclass
class TrustDeedData:
    document_type:       str           = "TRUST_DEED_OR_INCORPORATION"
    organisation_name:   Optional[str] = None
    formation_date:      Optional[str] = None
    registered_address:  Optional[str] = None
    trustee_names:       list          = field(default_factory=list)
    registration_number: Optional[str] = None


class TrustDeedExtractor(BaseExtractor):

    def extract(self, text):
        data     = TrustDeedData()
        lines    = self._lines(text)
        trustees = []

        for line in lines:
            ll = line.lower()

            if re.search(r"(name\s*of\s*(the\s*)?(trust|society|company))\s*[:\-]", line, re.I):
                val = self._after_colon(line)
                if val and not data.organisation_name:
                    data.organisation_name = self._clean_name(val)

            if re.search(r"(formation|establishment|execution|incorporation)\s*(date|dated)\s*[:\-]", line, re.I):
                if not data.formation_date:
                    data.formation_date = self._find_date(line)

            if re.search(r"reg(istration)?\s*(no|number)\s*[:\-]", line, re.I):
                val = self._after_colon(line)
                if val and not data.registration_number:
                    data.registration_number = val.strip()

            if re.search(r"(trustee|settler|founder|director)\s*[:\-]?\s*\d*", line, re.I):
                val = self._after_colon(line)
                if val:
                    name = self._clean_name(val)
                    if name and len(name) > 3:
                        trustees.append(name)

            if re.search(r"(registered\s*)?address\s*[:\-]", ll) and not data.registered_address:
                data.registered_address = self._after_colon(line)

        data.trustee_names = list(set(trustees))
        return self.to_dict(data)


EXTRACTORS = {
    "registration_certificate": RegistrationCertExtractor(),
    "pan":                      PANExtractor(),
    "fcra":                     FCRAExtractor(),
    "audit_report":             AuditReportExtractor(),
    "trust_deed":               TrustDeedExtractor(),
    "incorporation_document":   TrustDeedExtractor(),
}

def get_extractor(doc_type):
    extractor = EXTRACTORS.get(doc_type.lower())
    if not extractor:
        raise ValueError(f"Unknown doc_type: '{doc_type}'. Valid: {list(EXTRACTORS.keys())}")
    return extractor