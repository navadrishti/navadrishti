import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories'
import { formatPastProjectsForSearch, ngoIsCsrEligibleForWorkThrough } from '@/lib/auth'

export type CampaignMatchInput = {
  campaignName?: string
  category?: string
  city?: string
  state?: string
  volunteers_needed?: number
  /** Campaign end date — NGOs whose CSR-1 expires before this are excluded */
  end_date?: string
}

export type ScoredNgo = {
  id: number
  name: string
  email: string | null
  city?: string | null
  state_province?: string | null
  ngo_volunteer_capacity?: number
  verification_status?: string | null
  verified?: boolean
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

  const scored = (ngos || [])
    .filter((ngo: any) =>
      ngoIsCsrEligibleForWorkThrough(ngo.verification_status, ngo.profile_data, input.end_date, {
        requireWorkEnd: true,
      })
    )
    .map((ngo: any) => {
    const profile = ngo.profile_data && typeof ngo.profile_data === 'object' ? ngo.profile_data : {}
    const focus = String(profile.focus_areas || profile.cause_areas || profile.sectors || '')
    const past =
      formatPastProjectsForSearch(profile.past_projects) ||
      String(profile.experience || profile.description || '')
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
      verification_status: ngo.verification_status ?? null,
      verified: String(ngo.verification_status || '').toLowerCase() === 'verified',
      score: Math.round(score * 10) / 10,
    }
  })

  scored.sort((left, right) => right.score - left.score)

  if (scored.length === 0) return []

  const minimum = Math.min(limit, scored.length)
  return scored.slice(0, minimum)
}

/** Viewer profile fields used to personalize NGO Network recommendations. */
export type ViewerRecommendationProfile = {
  id?: number | null
  user_type?: string | null
  city?: string | null
  state_province?: string | null
  location?: string | null
  pincode?: string | null
  country?: string | null
  industry?: string | null
  profile_data?: Record<string, unknown> | null
}

export type NetworkNgoCandidate = {
  id: number
  name?: string | null
  location?: string | null
  sector?: string | null
  sectors_schedule_vii?: string[] | null
  mission?: string | null
  geographic_coverage_preview?: string | null
  projects_completed_count?: number | null
  projects_ongoing_count?: number | null
  projects_active_count?: number | null
  csr_eligible?: boolean | null
  compliance?: {
    verified?: boolean
    csr1?: boolean
    section_12a?: boolean
    section_80g?: boolean
    fcra?: boolean
  } | null
  city?: string | null
  state_province?: string | null
  search_haystack?: string | null
}

function asProfileObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function collectViewerFocusTerms(viewer: ViewerRecommendationProfile): string[] {
  const profile = asProfileObject(viewer.profile_data)
  const buckets = [
    profile.focus_areas,
    profile.cause_areas,
    profile.sectors,
    profile.sectors_schedule_vii,
    profile.preferred_sectors,
    profile.csr_focus_areas,
    profile.interests,
    profile.industry,
    viewer.industry,
  ]

  const terms = new Set<string>()
  for (const bucket of buckets) {
    if (Array.isArray(bucket)) {
      bucket.forEach((item) => tokenize(String(item || '')).forEach((token) => terms.add(token)))
      continue
    }
    tokenize(String(bucket || '')).forEach((token) => terms.add(token))
    categoryKeywords(String(bucket || '')).forEach((token) => terms.add(token))
  }
  return Array.from(terms)
}

function viewerLocationParts(viewer: ViewerRecommendationProfile) {
  const profile = asProfileObject(viewer.profile_data)
  const city = String(viewer.city || profile.city || '').trim().toLowerCase()
  const state = String(viewer.state_province || profile.state_province || profile.state || '')
    .trim()
    .toLowerCase()
  const location = String(viewer.location || profile.location || '').trim().toLowerCase()
  const pincode = String(viewer.pincode || profile.pincode || '').trim().toLowerCase()
  const country = String(viewer.country || profile.country || 'India').trim().toLowerCase()
  return { city, state, location, pincode, country }
}

/** Score an NGO against the viewing user's profile (location, focus, industry, compliance). */
export function scoreNgoForViewer(
  ngo: NetworkNgoCandidate,
  viewer: ViewerRecommendationProfile
): number {
  const viewerId = Number(viewer.id || 0)
  if (viewerId > 0 && Number(ngo.id) === viewerId) return 0

  const loc = viewerLocationParts(viewer)
  const focusTerms = collectViewerFocusTerms(viewer)
  const userType = String(viewer.user_type || '').toLowerCase()

  const ngoCity = String(ngo.city || '').trim().toLowerCase()
  const ngoState = String(ngo.state_province || '').trim().toLowerCase()
  const ngoLocation = String(ngo.location || '').trim().toLowerCase()
  const coverage = String(ngo.geographic_coverage_preview || '').trim().toLowerCase()
  const sectors = (Array.isArray(ngo.sectors_schedule_vii) ? ngo.sectors_schedule_vii : [])
    .map((item) => String(item || '').toLowerCase())
  const mission = String(ngo.mission || '').toLowerCase()
  const haystack = String(
    ngo.search_haystack ||
      [ngo.name, ngoLocation, ngo.sector, ...sectors, mission, coverage].join(' ')
  ).toLowerCase()

  let score = 0

  if (loc.city && (ngoCity === loc.city || ngoLocation.includes(loc.city) || coverage.includes(loc.city))) {
    score += 40
  } else if (loc.state && (ngoState === loc.state || ngoLocation.includes(loc.state) || coverage.includes(loc.state))) {
    score += 25
  } else if (loc.location) {
    const locationTokens = tokenize(loc.location)
    const hits = locationTokens.filter(
      (token) => ngoLocation.includes(token) || coverage.includes(token) || haystack.includes(token)
    ).length
    score += Math.min(18, hits * 6)
  }

  if (loc.pincode && haystack.includes(loc.pincode)) score += 8

  if (focusTerms.length > 0) {
    const sectorHits = focusTerms.filter((term) =>
      sectors.some((sector) => sector.includes(term) || term.includes(sector))
    ).length
    const textHits = focusTerms.filter((term) => haystack.includes(term)).length
    score += Math.min(55, sectorHits * 18 + textHits * 6)
  }

  const industryTokens = tokenize(String(viewer.industry || asProfileObject(viewer.profile_data).industry || ''))
  if (industryTokens.length > 0) {
    const industryHits = industryTokens.filter((token) => haystack.includes(token)).length
    score += Math.min(16, industryHits * 5)
  }

  if (ngo.compliance?.verified) score += 10
  if (userType === 'company') {
    if (ngo.csr_eligible || ngo.compliance?.csr1) score += 16
    if (ngo.compliance?.section_12a) score += 5
    if (ngo.compliance?.section_80g) score += 5
  } else if (userType === 'individual') {
    if (ngo.compliance?.section_80g) score += 4
    if (ngo.compliance?.section_12a) score += 3
  } else if (userType === 'ngo') {
    // Peer NGOs: prefer similar geography / sector only; light activity signal.
    score += Math.min(8, Number(ngo.projects_ongoing_count || 0) + Number(ngo.projects_active_count || 0))
  }

  score += Math.min(8, Number(ngo.projects_completed_count || 0))
  score += Math.min(4, Number(ngo.projects_ongoing_count || 0))

  return Math.round(score * 10) / 10
}

/**
 * Rank NGOs for a viewer: take the best `poolSize`, keep superior scores ahead of weaker ones,
 * and only reshuffle NGOs that share the same score (for refresh variety).
 */
export function rankRecommendedNgosForViewer<T extends NetworkNgoCandidate>(
  ngos: T[],
  viewer: ViewerRecommendationProfile,
  options?: {
    poolSize?: number
    displaySize?: number
    shuffleTies?: boolean
  }
): Array<T & { match_score: number }> {
  const poolSize = Math.max(1, Number(options?.poolSize || 6))
  const displaySize = Math.max(1, Number(options?.displaySize || 4))
  const shuffleTies = options?.shuffleTies !== false

  const scored = (ngos || [])
    .map((ngo) => ({
      ...ngo,
      match_score: scoreNgoForViewer(ngo, viewer),
    }))
    .filter((ngo) => ngo.match_score > 0)
    .sort((left, right) => {
      if (right.match_score !== left.match_score) return right.match_score - left.match_score
      return String(left.name || '').localeCompare(String(right.name || ''))
    })
    .slice(0, poolSize)

  if (scored.length === 0) return []

  const groups = new Map<number, Array<T & { match_score: number }>>()
  for (const row of scored) {
    const key = row.match_score
    const bucket = groups.get(key) || []
    bucket.push(row)
    groups.set(key, bucket)
  }

  const orderedScores = Array.from(groups.keys()).sort((a, b) => b - a)
  const ranked: Array<T & { match_score: number }> = []
  for (const score of orderedScores) {
    const bucket = groups.get(score) || []
    if (shuffleTies && bucket.length > 1) {
      for (let i = bucket.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[bucket[i], bucket[j]] = [bucket[j], bucket[i]]
      }
    }
    ranked.push(...bucket)
  }

  return ranked.slice(0, Math.min(displaySize, ranked.length))
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
