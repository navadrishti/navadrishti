import type { NetworkNgo } from "./types"

export function getInitials(name: string) {
  if (!name) return "N"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ngoComplianceTags(ngo: NetworkNgo) {
  if (Array.isArray(ngo.ca_compliance_tags) && ngo.ca_compliance_tags.length > 0) {
    return ngo.ca_compliance_tags
  }
  return [
    ngo.compliance.section_12a ? 'twelve_a' : null,
    ngo.compliance.section_80g ? 'eighty_g' : null,
    ngo.compliance.csr1 ? 'csr1' : null,
    ngo.compliance.fcra ? 'fcra' : null,
  ].filter((tag): tag is string => Boolean(tag))
}

export function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural
}
