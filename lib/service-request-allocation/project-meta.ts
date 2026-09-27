import { parseJsonObject } from '@/lib/utils'

/** Structured extras for service_request_projects without new DB columns. */
export type ServiceRequestProjectMeta = {
  category?: string | null
  budget_inr?: number | null
  impact_description?: string | null
  contact_info?: string | null
  pending_company_applications?: Array<{
    company_id: number
    company_name?: string | null
    note?: string | null
    applied_at: string
    status?: string
    source?: string
    applicant_user_id?: number
  }>
}

const PROJECT_META_START = '<!--nd-project-meta:'
const PROJECT_META_END = ':nd-project-meta-->'

export function stripProjectMetaFromDescription(description?: string | null): string {
  const text = String(description || '')
  const start = text.indexOf(PROJECT_META_START)
  if (start < 0) return text.trim()
  const end = text.indexOf(PROJECT_META_END, start)
  if (end < 0) return text.trim()
  return `${text.slice(0, start)}${text.slice(end + PROJECT_META_END.length)}`.trim()
}

export function parseProjectMeta(description?: string | null): ServiceRequestProjectMeta {
  const text = String(description || '')
  const start = text.indexOf(PROJECT_META_START)
  if (start < 0) return {}
  const end = text.indexOf(PROJECT_META_END, start)
  if (end < 0) return {}
  try {
    const raw = text.slice(start + PROJECT_META_START.length, end).trim()
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as ServiceRequestProjectMeta) : {}
  } catch {
    return {}
  }
}

export function withProjectMeta(
  description: string | null | undefined,
  meta: ServiceRequestProjectMeta
): string {
  const visible = stripProjectMetaFromDescription(description)
  const existing = parseProjectMeta(description)
  const next: ServiceRequestProjectMeta = {
    ...existing,
    ...meta,
  }
  if (Array.isArray(next.pending_company_applications) && next.pending_company_applications.length === 0) {
    delete next.pending_company_applications
  }
  const hasExtras = Boolean(
    next.category ||
    next.budget_inr != null ||
    next.impact_description ||
    next.contact_info ||
    (next.pending_company_applications && next.pending_company_applications.length > 0)
  )
  if (!hasExtras) return visible
  return `${visible}\n\n${PROJECT_META_START}${JSON.stringify(next)}${PROJECT_META_END}`.trim()
}

type EnrichableProject = {
  description?: string | null
  category?: string | null
  budget_inr?: number | null
  impact_description?: string | null
  contact_info?: string | null
}

export function enrichProjectRecord<T extends EnrichableProject>(project: T | null | undefined) {
  if (!project) return project
  const meta = parseProjectMeta(project.description)
  return {
    ...project,
    description: stripProjectMetaFromDescription(project.description),
    category: meta.category || project.category || null,
    budget_inr: meta.budget_inr ?? project.budget_inr ?? null,
    impact_description: meta.impact_description || project.impact_description || null,
    contact_info: meta.contact_info || project.contact_info || null,
    pending_company_applications: meta.pending_company_applications || [],
    _raw_description: project.description,
  }
}

/** Public/anonymous responses must not expose applicant or contact meta. */
type RedactableProject = {
  contact_info?: unknown
  pending_company_applications?: unknown
  _raw_description?: unknown
  ngo?: unknown
}

// Same profile_data keys app/api/profile/[userId] shows to viewers without private access.
const PUBLIC_NGO_PROFILE_KEYS = ['bio', 'ca_badge_number', 'cover_image', 'website']

function redactNgoContact(ngo: unknown) {
  if (!ngo || typeof ngo !== 'object') return ngo
  const { email: _email, phone: _phone, profile_data: profileData, ...safe } = ngo as Record<string, unknown>
  const profile = parseJsonObject(profileData)
  return {
    ...safe,
    profile_data: Object.fromEntries(
      PUBLIC_NGO_PROFILE_KEYS.filter((key) => profile[key] !== undefined).map((key) => [key, profile[key]])
    ),
  }
}

export function redactProjectSensitiveFields<T extends RedactableProject>(project: T | null | undefined) {
  if (!project) return project
  const {
    contact_info: _contact,
    pending_company_applications: _apps,
    _raw_description: _raw,
    ...safe
  } = project
  return {
    ...safe,
    ...('ngo' in project ? { ngo: redactNgoContact(project.ngo) } : {}),
    contact_info: null,
    pending_company_applications: [],
  }
}

/**
 * Rebuild description from client-visible text while preserving server-owned meta.
 * Prevents smuggling pending_company_applications via raw description PUT.
 */
export function mergeClientProjectDescription(
  existingDescription: string | null | undefined,
  clientDescription: string | null | undefined,
  overrides: Omit<ServiceRequestProjectMeta, 'pending_company_applications'> = {}
): string {
  const existingMeta = parseProjectMeta(existingDescription)
  const visible = stripProjectMetaFromDescription(clientDescription)
  return withProjectMeta(visible, {
    category: overrides.category !== undefined ? overrides.category : existingMeta.category,
    budget_inr: overrides.budget_inr !== undefined ? overrides.budget_inr : existingMeta.budget_inr,
    impact_description:
      overrides.impact_description !== undefined
        ? overrides.impact_description
        : existingMeta.impact_description,
    contact_info: overrides.contact_info !== undefined ? overrides.contact_info : existingMeta.contact_info,
    pending_company_applications: existingMeta.pending_company_applications,
  })
}

export function isAuthenticCompanyProjectApplication(app: {
  company_id?: number
  applicant_user_id?: number
  source?: string
} | null | undefined): boolean {
  if (!app) return false
  const companyId = Number(app.company_id || 0)
  if (!Number.isFinite(companyId) || companyId <= 0) return false
  if (String(app.source || '') !== 'company_apply') return false
  const applicantId = Number(app.applicant_user_id ?? app.company_id)
  return applicantId === companyId
}
