import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories'

/** Same Schedule VII categories used across needs, campaigns, and NGO/company profiles. */
export const IMPACT_AREAS = [...CSR_SCHEDULE_VII_CATEGORIES] as string[]

export const IMPACT_AREA_OPTIONS = IMPACT_AREAS.map((value) => ({
  value,
  label: value,
}))

/** Legacy capability impact_area slugs → Schedule VII (for existing offers + filters). */
const LEGACY_IMPACT_AREA_TO_SCHEDULE_VII: Record<string, string> = {
  education: 'Education and Livelihood Enhancement',
  healthcare: 'Promoting Healthcare and Sanitation',
  environment: 'Environmental Sustainability',
  women_empowerment: 'Gender Equality and Women Empowerment',
  livelihood: 'Education and Livelihood Enhancement',
  disability: 'Promoting Healthcare and Sanitation',
  child_welfare: 'Education and Livelihood Enhancement',
  rural_development: 'Rural Development Projects',
  disaster_management: 'Disaster Management and Relief',
  sports: 'Sports Promotion',
  heritage_culture: 'Protection of Heritage, Art and Culture',
}

export function normalizeImpactAreaValue(value: unknown): string | null {
  const text = String(value || '').trim()
  if (!text) return null
  if (IMPACT_AREAS.includes(text)) return text

  const legacy = LEGACY_IMPACT_AREA_TO_SCHEDULE_VII[text]
  if (legacy) return legacy

  const byCase = IMPACT_AREAS.find((category) => category.toLowerCase() === text.toLowerCase())
  if (byCase) return byCase

  const legacyByCase = Object.entries(LEGACY_IMPACT_AREA_TO_SCHEDULE_VII).find(
    ([slug]) => slug.toLowerCase() === text.toLowerCase()
  )
  return legacyByCase?.[1] ?? null
}

export function normalizeImpactAreas(values: unknown): string[] {
  const list = Array.isArray(values)
    ? values
    : typeof values === 'string' && values.trim()
      ? values.split(',').map((part) => part.trim())
      : []

  const next: string[] = []
  for (const entry of list) {
    const normalized = normalizeImpactAreaValue(entry)
    if (normalized && !next.includes(normalized)) next.push(normalized)
  }
  return next
}

export function formatImpactAreaLabel(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''
  return normalizeImpactAreaValue(text) || text.replace(/_/g, ' ')
}

export function impactAreaMatchesFilter(
  areas: unknown,
  filter: string | null | undefined
): boolean {
  const selected = String(filter || '').trim()
  if (!selected || selected === 'all' || selected === 'All Categories' || selected === 'All impact areas') {
    return true
  }

  const target = normalizeImpactAreaValue(selected) || selected
  const aliases = new Set<string>([target])
  for (const [slug, category] of Object.entries(LEGACY_IMPACT_AREA_TO_SCHEDULE_VII)) {
    if (category === target) aliases.add(slug)
  }

  const list = Array.isArray(areas) ? areas : []
  return list.some((area) => {
    const text = String(area || '').trim()
    if (!text) return false
    if (aliases.has(text)) return true
    const normalized = normalizeImpactAreaValue(text)
    return Boolean(normalized && aliases.has(normalized))
  })
}
