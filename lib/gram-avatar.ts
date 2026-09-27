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

function hashSeed(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash
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
