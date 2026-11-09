import { readFileSync } from 'fs'
import { join } from 'path'
import { PRODUCT_LOGO_SRC, PRODUCT_NAME } from '@/lib/access-control'

/**
 * Official GRAM mark for offline HTML downloads.
 * Relative `/photos/...` URLs break once the file is saved outside the app origin,
 * so documents embed the verified repository SVG as a data URI.
 *
 * Navadrishti LLP is represented by legal name text only until an official
 * parent-brand logo asset is confirmed (repo `logo.svg` / `logo1.svg` are not
 * wired as product brand and must not be assumed official).
 */
let cachedGramLogoDataUri: string | null | undefined

const GRAM_SVG_PATH = join(process.cwd(), 'public', 'photos', 'Gram.svg')

export function getGramLogoDataUri(): string | null {
  if (cachedGramLogoDataUri !== undefined) return cachedGramLogoDataUri
  try {
    const svg = readFileSync(GRAM_SVG_PATH, 'utf8')
    cachedGramLogoDataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
  } catch {
    cachedGramLogoDataUri = null
  }
  return cachedGramLogoDataUri
}

export function gramBrandMarkHtml(): string {
  const dataUri = getGramLogoDataUri()
  if (!dataUri) {
    return `<strong>${PRODUCT_NAME}</strong>`
  }
  return `<span class="brand-lockup"><img class="brand-logo" src="${dataUri}" alt="${PRODUCT_NAME}" width="36" height="36" /><strong>${PRODUCT_NAME}</strong></span>`
}

/** Public path for online preview contexts (browser preview of in-app HTML). */
export const GRAM_LOGO_PUBLIC_PATH = PRODUCT_LOGO_SRC
