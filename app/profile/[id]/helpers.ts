import type { ComplianceCard, NgoPublicProfile } from "./types"

const COMPLIANCE_DOC_ORDER = ["twelve_a", "eighty_g", "csr1", "fcra"] as const
const COMPLIANCE_DOC_LABELS: Record<(typeof COMPLIANCE_DOC_ORDER)[number], string> = {
  twelve_a: "12A",
  eighty_g: "80G",
  csr1: "CSR-1",
  fcra: "FCRA",
}

export const DELIVERY_MODEL_LABELS: Record<string, string> = {
  direct: "Direct delivery",
  partner_led: "Partner-led",
  hybrid: "Hybrid (direct + partners)",
}

function isComplianceDocKey(key: string): key is (typeof COMPLIANCE_DOC_ORDER)[number] {
  return (COMPLIANCE_DOC_ORDER as readonly string[]).includes(key)
}

export function formatUserType(userType?: string) {
  const value = String(userType || "").trim().toLowerCase()
  if (value === "ngo") return "NGO"
  if (value === "individual") return "Individual"
  if (value === "company") return "Company"
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Not set"
}

export function formatVolunteerCapacity(value?: string | number | null) {
  if (value === null || value === undefined) return "Not set"
  const text = String(value).trim()
  if (!text) return "Not set"
  return /people/i.test(text) ? text : `${text} people`
}

export function getInitials(name: string) {
  if (!name) return "U"
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
}

export function formatMonthYear(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

/** Merges expiry records and uploaded documents into one card per compliance doc, in display order. */
export function buildComplianceCards(ngo: NgoPublicProfile | undefined): ComplianceCard[] {
  const caTags = new Set(ngo?.ca_compliance_tags || [])
  const byKey = new Map<string, ComplianceCard>()

  for (const item of ngo?.document_expiries || []) {
    if (!isComplianceDocKey(item.key)) continue
    byKey.set(item.key, {
      key: item.key,
      kind: item.key,
      label: item.label || COMPLIANCE_DOC_LABELS[item.key],
      number: item.number,
      valid_until: item.valid_until,
      status: item.status,
      url: null,
      verified: caTags.has(item.key),
    })
  }

  for (const doc of ngo?.compliance_documents || []) {
    if (!isComplianceDocKey(doc.key)) continue
    const existing = byKey.get(doc.key)
    if (existing) {
      existing.url = doc.url
      existing.number = existing.number || doc.registration_number
      existing.label = existing.label || doc.label || COMPLIANCE_DOC_LABELS[doc.key]
      existing.verified = existing.verified || caTags.has(doc.key)
    } else {
      byKey.set(doc.key, {
        key: doc.key,
        kind: doc.key,
        label: doc.label || COMPLIANCE_DOC_LABELS[doc.key],
        number: doc.registration_number,
        url: doc.url,
        verified: caTags.has(doc.key),
      })
    }
  }

  return COMPLIANCE_DOC_ORDER.map((key) => byKey.get(key)).filter(
    (card): card is ComplianceCard => Boolean(card)
  )
}
