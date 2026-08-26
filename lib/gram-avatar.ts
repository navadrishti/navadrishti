export type GramAccountType = 'individual' | 'ngo' | 'company'

/**
 * Deterministic muted avatar fills — three intentional variants, not a rainbow.
 */
export const GRAM_AVATAR_PALETTE = [
  '#66877D', // muted teal-sage
  '#829D8E', // soft sage
  '#6F7F85', // muted blue-gray
] as const

/** Softened initials — integrates better than pure white on muted fills. */
export const GRAM_AVATAR_INITIALS = '#F4F6F4'

/** Default / legacy single solid (first palette entry). */
export const GRAM_AVATAR_SOLID = GRAM_AVATAR_PALETTE[0]

function hashSeed(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash
}

export function normalizeGramAccountType(type?: string | null): GramAccountType {
  const raw = String(type || '')
    .trim()
    .toLowerCase()
  if (!raw) return 'individual'
  if (raw === 'ngo' || raw.includes('ngo') || raw.includes('non-profit') || raw.includes('nonprofit')) {
    return 'ngo'
  }
  if (raw === 'company' || raw.includes('compan') || raw.includes('corporate') || raw.includes('business')) {
    return 'company'
  }
  if (raw.includes('professional') || raw.includes('individual') || raw.includes('person') || raw.includes('volunteer')) {
    return 'individual'
  }
  return 'individual'
}

/** 1–2 letter monogram for avatar placeholders. */
export function getGramMonogram(name: string): string {
  const cleaned = String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!cleaned) return 'G'

  const parts = cleaned.split(' ').filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0][0] || ''
    const b = parts[1][0] || ''
    return `${a}${b}`.toUpperCase()
  }

  return cleaned.slice(0, 2).toUpperCase()
}

/** Stable muted fill from name — same org always gets the same color. */
export function getGramAvatarSolid(name?: string): string {
  const seed = String(name || 'G').trim().toLowerCase() || 'g'
  return GRAM_AVATAR_PALETTE[hashSeed(seed) % GRAM_AVATAR_PALETTE.length]
}

export function getGramAvatarFallbackStyle(name?: string): {
  backgroundColor: string
  color: string
} {
  return {
    backgroundColor: getGramAvatarSolid(name),
    color: GRAM_AVATAR_INITIALS,
  }
}

/** Shared Tailwind classes for solid initials placeholders (color via style). */
export const GRAM_AVATAR_FALLBACK_CLASS = 'font-semibold'
