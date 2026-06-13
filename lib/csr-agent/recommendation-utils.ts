import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories'

export type CampaignMatchInput = {
  campaignName?: string
  category?: string
  city?: string
  state?: string
  volunteers_needed?: number
}

export type ScoredNgo = {
  id: number
  name: string
  email: string | null
  city?: string | null
  state_province?: string | null
  ngo_volunteer_capacity?: number
  score: number
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  hunger: ['hunger', 'food', 'nutrition', 'poverty', 'malnutrition'],
  healthcare: ['health', 'healthcare', 'sanitation', 'medical', 'hospital'],
  education: ['education', 'school', 'learning', 'livelihood', 'training'],
  gender: ['gender', 'women', 'empowerment', 'equality'],
  environment: ['environment', 'climate', 'sustainability', 'green', 'tree'],
  heritage: ['heritage', 'culture', 'art'],
  armed: ['veteran', 'armed', 'forces', 'defence'],
  rural: ['rural', 'village', 'agriculture'],
  slum: ['slum', 'urban', 'housing'],
  sports: ['sport', 'sports', 'athlete'],
  disaster: ['disaster', 'relief', 'emergency'],
}

export function tokenize(value: string | undefined | null): string[] {
  if (!value) return []
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2)
}

export function categoryKeywords(category: string | undefined | null): string[] {
  const text = String(category || '').trim()
  if (!text) return []

  const tokens = new Set<string>(tokenize(text))
  const lower = text.toLowerCase()

  for (const [needle, aliases] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(needle)) {
      aliases.forEach((alias) => tokens.add(alias))
    }
  }

  for (const entry of CSR_SCHEDULE_VII_CATEGORIES) {
    if (entry.toLowerCase() === lower) {
      tokenize(entry).forEach((token) => tokens.add(token))
    }
  }

  return Array.from(tokens)
}

export function buildRequirementDetails(input: {
  campaignName?: string
  category?: string
  city?: string
  state?: string
  requirementDetails?: string
}): string {
  const explicit = String(input.requirementDetails || '').trim()
  if (explicit) return explicit

  const parts = [
    input.campaignName?.trim(),
    input.category?.trim(),
    input.city?.trim() && input.state?.trim()
      ? `Location: ${input.city}, ${input.state}`
      : input.city?.trim() || input.state?.trim(),
    'CSR campaign capability and execution support',
  ].filter(Boolean)

  return parts.join('. ') || 'CSR campaign execution support'
}

export function scoreNgosForCampaign(ngos: any[], input: CampaignMatchInput, limit = 10): ScoredNgo[] {
  const reqTokens = [
    ...tokenize(input.campaignName),
    ...categoryKeywords(input.category),
  ]
  const categoryLower = String(input.category || '').toLowerCase()
  const cityLower = String(input.city || '').toLowerCase()
  const stateLower = String(input.state || '').toLowerCase()
  const requiredVolunteers = Number(input.volunteers_needed || 0)

  const scored = (ngos || []).map((ngo: any) => {
    const profile = ngo.profile_data && typeof ngo.profile_data === 'object' ? ngo.profile_data : {}
    const focus = String(profile.focus_areas || profile.cause_areas || profile.sectors || '')
    const past = String(profile.past_projects || profile.experience || profile.description || '')
    const profileText = `${focus} ${past} ${String(ngo.name || '')}`.toLowerCase()

    let score = 15

    if (ngo.name) score += 5
    if (String(ngo.verification_status || '').toLowerCase() === 'verified') score += 20

    if (categoryLower && profileText.includes(categoryLower)) score += 35

    const focusTokens = tokenize(focus)
    const overlap = reqTokens.filter((token) => focusTokens.includes(token) || profileText.includes(token)).length
    score += Math.min(30, overlap * 8)

    if (cityLower && String(ngo.city || '').toLowerCase() === cityLower) score += 25
    else if (stateLower && String(ngo.state_province || '').toLowerCase() === stateLower) score += 12

    const capacity = Number(ngo.ngo_volunteer_capacity || profile.ngo_volunteer_capacity || profile.team_strength || 0)
    if (requiredVolunteers > 0 && capacity > 0) {
      score += Math.min(8, Math.round((capacity / requiredVolunteers) * 8))
    } else if (capacity > 0) {
      score += 2
    }

    return {
      id: Number(ngo.id),
      name: String(ngo.name || 'NGO Partner'),
      email: ngo.email ? String(ngo.email) : null,
      city: ngo.city ?? null,
      state_province: ngo.state_province ?? null,
      ngo_volunteer_capacity: Number.isFinite(capacity) ? capacity : undefined,
      score: Math.round(score * 10) / 10,
    }
  })

  scored.sort((left, right) => right.score - left.score)

  if (scored.length === 0) return []

  const minimum = Math.min(limit, scored.length)
  return scored.slice(0, minimum)
}

export function scoreProjectSuggestions<T extends {
  id: string
  title: string
  description?: string
  location?: string
  timeline?: string
}>(projects: T[], input: CampaignMatchInput): T[] {
  const tokens = [
    ...tokenize(input.campaignName),
    ...categoryKeywords(input.category),
    ...tokenize(input.city),
    ...tokenize(input.state),
  ]

  return [...projects]
    .map((project) => {
      const haystack = `${project.title} ${project.description || ''} ${project.location || ''} ${project.timeline || ''}`.toLowerCase()
      let score = 10
      for (const token of tokens) {
        if (haystack.includes(token)) score += 8
      }
      if (input.city && String(project.location || '').toLowerCase().includes(String(input.city).toLowerCase())) score += 12
      if (input.state && String(project.location || '').toLowerCase().includes(String(input.state).toLowerCase())) score += 8
      return { project, score }
    })
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.project)
}

export function ensureTopMatches<T extends { score: number }>(matches: T[], minimum = 1, limit = 5): T[] {
  if (matches.length === 0) return []
  const sorted = [...matches].sort((left, right) => right.score - left.score)
  const strong = sorted.filter((match) => match.score >= 20)
  const chosen = strong.length >= minimum ? strong : sorted
  return chosen.slice(0, limit)
}
