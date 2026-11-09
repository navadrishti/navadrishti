import { NextResponse } from 'next/server'
import { getComplianceDocumentUrl } from '@/lib/auth'
import {
  isKycDocumentRef,
  ownerUserIdFromVerificationPublicId,
  parseKycDocumentRef,
  resolveDocumentFieldValue,
} from '@/lib/kyc/document-refs'

const CLOUDINARY_HOST = 'res.cloudinary.com'
const CLOUDINARY_RESOURCE_TYPES = new Set(['image', 'raw', 'video'])
const CLOUDINARY_DELIVERY_TYPES = new Set(['upload', 'authenticated', 'private'])

/**
 * Only URLs on our own Cloudinary cloud (or opaque ndkyc refs) may be stored as
 * verification documents or fetched server-side. With ownerUserId the path must
 * also sit under `verification/<category>/<ownerUserId>/`.
 *
 * Legacy public assets use delivery type `upload`. New KYC assets use
 * `authenticated` and are stored as ndkyc refs — never treat a bare public URL
 * as an authenticated reference.
 */
export function isTrustedDocumentUrl(value: unknown, options: { ownerUserId?: number } = {}): boolean {
  if (isKycDocumentRef(value)) {
    const ref = parseKycDocumentRef(value)
    if (!ref) return false
    if (options.ownerUserId === undefined) return true
    return ownerUserIdFromVerificationPublicId(ref.publicId) === options.ownerUserId
  }

  if (
    typeof value === 'string' &&
    /^\/api\/verification\/documents\/[0-9a-f-]{36}\/file$/i.test(value.trim())
  ) {
    // Content-proxy paths are server-authorized at request time; treat as trusted locators.
    return options.ownerUserId === undefined
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  if (!cloudName || typeof value !== 'string') return false

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.hostname !== CLOUDINARY_HOST) return false
  if (url.port || url.username || url.password) return false

  const [cloud, resourceType, deliveryType, ...rest] = url.pathname.split('/').filter(Boolean)
  if (
    cloud !== cloudName ||
    !CLOUDINARY_RESOURCE_TYPES.has(resourceType) ||
    !CLOUDINARY_DELIVERY_TYPES.has(deliveryType)
  ) {
    return false
  }
  // Authenticated/private CDN URLs must not be accepted as client-submitted
  // durable links — clients submit ndkyc refs instead.
  if (deliveryType !== 'upload') return false
  if (rest.length === 0) return false
  if (options.ownerUserId === undefined) return true

  const path = /^v\d+$/.test(rest[0]) ? rest.slice(1) : rest
  return path.length >= 4 && path[0] === 'verification' && path[2] === String(options.ownerUserId)
}

/** 400 response for the first submitted document that is not an upload owned by the user. */
export function untrustedDocumentResponse(
  ownerUserId: number,
  ...documentMaps: unknown[]
): NextResponse | null {
  for (const map of documentMaps) {
    if (map == null) continue
    if (typeof map !== 'object' || Array.isArray(map)) {
      return NextResponse.json({ error: 'Invalid documents payload' }, { status: 400 })
    }
    for (const [key, value] of Object.entries(map)) {
      if (value == null || (typeof value === 'string' && !value.trim())) continue
      const resolved = resolveDocumentFieldValue(value)
      if (!resolved && typeof value === 'object') continue
      if (!isTrustedDocumentUrl(resolved || getComplianceDocumentUrl(value), { ownerUserId })) {
        return NextResponse.json(
          { error: `Document "${key}" must be uploaded through the verification upload.` },
          { status: 400 }
        )
      }
    }
  }
  return null
}
