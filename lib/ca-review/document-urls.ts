import { NextResponse } from 'next/server'
import { getComplianceDocumentUrl } from '@/lib/auth'

const CLOUDINARY_HOST = 'res.cloudinary.com'
const CLOUDINARY_RESOURCE_TYPES = new Set(['image', 'raw', 'video'])

/**
 * Only URLs on our own Cloudinary cloud may be stored as verification documents or fetched
 * server-side. With ownerUserId the path must also sit under `verification/<category>/<ownerUserId>/`,
 * which is where /api/verification/upload stores files.
 */
export function isTrustedDocumentUrl(value: unknown, options: { ownerUserId?: number } = {}): boolean {
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
  if (cloud !== cloudName || !CLOUDINARY_RESOURCE_TYPES.has(resourceType) || deliveryType !== 'upload') {
    return false
  }
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
      const url = getComplianceDocumentUrl(value)
      if (!url && typeof value === 'object') continue
      if (!isTrustedDocumentUrl(url, { ownerUserId })) {
        return NextResponse.json(
          { error: `Document "${key}" must be uploaded through the verification upload.` },
          { status: 400 }
        )
      }
    }
  }
  return null
}
