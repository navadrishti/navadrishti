import { getComplianceDocumentUrl } from '@/lib/auth/documents'

export const NDKYC_REF_PREFIX = 'ndkyc:v1:'

export type KycDeliveryType = 'authenticated' | 'upload'

export type KycDocumentRef = {
  deliveryType: KycDeliveryType
  resourceType: 'image' | 'raw' | 'video'
  publicId: string
  documentId: string
}

function encodePublicId(publicId: string): string {
  return Buffer.from(publicId, 'utf8').toString('base64url')
}

function decodePublicId(value: string): string | null {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8').trim()
    return decoded || null
  } catch {
    return null
  }
}

export function isKycDocumentRef(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(NDKYC_REF_PREFIX)
}

export function encodeKycDocumentRef(input: KycDocumentRef): string {
  const resourceType = input.resourceType
  const deliveryType = input.deliveryType
  if (deliveryType !== 'authenticated' && deliveryType !== 'upload') {
    throw new Error('Unsupported KYC delivery type')
  }
  if (!input.publicId.trim() || !input.documentId.trim()) {
    throw new Error('KYC document ref requires publicId and documentId')
  }
  return `${NDKYC_REF_PREFIX}${deliveryType}:${resourceType}:${encodePublicId(input.publicId)}:${input.documentId}`
}

export function parseKycDocumentRef(value: unknown): KycDocumentRef | null {
  if (!isKycDocumentRef(value)) return null
  const raw = String(value).slice(NDKYC_REF_PREFIX.length)
  const [deliveryType, resourceType, encodedPublicId, documentId] = raw.split(':')
  if (
    (deliveryType !== 'authenticated' && deliveryType !== 'upload') ||
    (resourceType !== 'image' && resourceType !== 'raw' && resourceType !== 'video') ||
    !encodedPublicId ||
    !documentId
  ) {
    return null
  }
  const publicId = decodePublicId(encodedPublicId)
  if (!publicId) return null
  return {
    deliveryType,
    resourceType,
    publicId,
    documentId,
  }
}

/** Resolve a submitted document field to a string URL or ndkyc ref. */
export function resolveDocumentFieldValue(value: unknown): string {
  if (isKycDocumentRef(value)) return String(value)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (isKycDocumentRef(record.documentRef)) return String(record.documentRef)
    if (isKycDocumentRef(record.ref)) return String(record.ref)
  }
  return getComplianceDocumentUrl(value)
}

export function kycContentPath(documentId: string): string {
  return `/api/verification/documents/${encodeURIComponent(documentId)}/file`
}

/** Owner user id encoded in verification/<category>/<userId>/... public ids. */
export function ownerUserIdFromVerificationPublicId(publicId: string): number | null {
  const parts = publicId.replace(/^\/+/, '').split('/').filter(Boolean)
  if (parts.length < 3 || parts[0] !== 'verification') return null
  const userId = Number(parts[2])
  return Number.isFinite(userId) && userId > 0 ? userId : null
}

export function actorTypeFromUploadCategory(category: string): 'individual' | 'ngo' | 'company' {
  const value = category.trim().toLowerCase()
  if (value === 'ngo') return 'ngo'
  if (value === 'company') return 'company'
  return 'individual'
}
