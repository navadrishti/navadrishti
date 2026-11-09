import { getComplianceDocumentUrl } from '@/lib/auth'
import { reverificationDocumentLabels } from '@/lib/reverification'
import type { CAReviewDocument } from '@/lib/ca-review-types'
import { parseJsonObject } from '@/lib/utils'
import { isTrustedDocumentUrl } from './document-urls'
import {
  isKycDocumentRef,
  kycContentPath,
  parseKycDocumentRef,
  resolveDocumentFieldValue,
} from '@/lib/kyc/document-refs'
import { kycContentProxyEnabled } from '@/lib/kyc/flags'

function fileNameFromUrl(url: string, fallback: string) {
  const ref = parseKycDocumentRef(url)
  if (ref) {
    const name = ref.publicId.split('/').pop() || ''
    return name || fallback
  }
  try {
    const path = new URL(url).pathname
    const name = decodeURIComponent(path.split('/').pop() || '')
    return name || fallback
  } catch {
    return fallback
  }
}

function isImageUrl(url: string) {
  const ref = parseKycDocumentRef(url)
  if (ref) return ref.resourceType === 'image'
  const path = url.split(/[?#]/)[0]
  return /\.(png|jpe?g|webp|gif)$/i.test(path) || path.includes('/image/upload')
}

export function isPendingUpload(doc: CAReviewDocument) {
  return doc.id.includes('-reverify-') || doc.id.includes('-pending-compliance-')
}

function documentLabel(key: string) {
  return reverificationDocumentLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim()
}

function reviewFileUrl(storageValue: string): string {
  const ref = parseKycDocumentRef(storageValue)
  if (ref && kycContentProxyEnabled()) return kycContentPath(ref.documentId)
  return storageValue
}

function documentsFromMap(map: Record<string, unknown>, prefix: string): CAReviewDocument[] {
  return Object.entries(map)
    .map(([key, value]) => {
      const storageValue = resolveDocumentFieldValue(value) || getComplianceDocumentUrl(value)
      if (!storageValue) return null
      if (isKycDocumentRef(storageValue)) {
        if (!parseKycDocumentRef(storageValue)) return null
      } else if (!isTrustedDocumentUrl(storageValue)) {
        return null
      }
      return {
        id: `${prefix}-${key}`,
        key,
        label: documentLabel(key),
        file_name: fileNameFromUrl(storageValue, `${key}.pdf`),
        file_url: reviewFileUrl(storageValue),
        is_image: isImageUrl(storageValue),
        ocr_fields: [],
        ocr_status: 'pending' as const,
      }
    })
    .filter((doc): doc is NonNullable<typeof doc> => doc != null)
}

function overlayDocuments(base: CAReviewDocument[], extra: CAReviewDocument[]): CAReviewDocument[] {
  const next = [...base]
  for (const doc of extra) {
    const idx = next.findIndex((item) => item.key === doc.key || item.file_url === doc.file_url)
    const labeled = { ...doc, label: `${doc.label} (updated)` }
    if (idx >= 0) next[idx] = labeled
    else next.push(labeled)
  }
  return next
}

export function extractDocuments(profileData: Record<string, unknown>, profileKey: string, prefix: string): CAReviewDocument[] {
  const verificationDocuments = parseJsonObject(profileData.verification_documents)
  const typeBlock = parseJsonObject(verificationDocuments[profileKey])
  const docs = documentsFromMap(parseJsonObject(typeBlock.documents), prefix)
  const staged = documentsFromMap(parseJsonObject(typeBlock.reverification_documents), `${prefix}-reverify`)

  if (profileKey === 'ngo') {
    const compliance = parseJsonObject(profileData.compliance_documents)
    const extra = documentsFromMap(
      {
        twelve_a: compliance.twelve_a,
        eighty_g: compliance.eighty_g,
        csr1: compliance.csr1,
      },
      `${prefix}-compliance`
    )
    const seen = new Set(docs.map((doc) => doc.file_url))
    for (const doc of extra) {
      if (!seen.has(doc.file_url)) docs.push(doc)
    }

    return overlayDocuments(docs, [
      ...staged,
      ...documentsFromMap(parseJsonObject(compliance.pending_reverification), `${prefix}-pending-compliance`),
    ])
  }

  return overlayDocuments(docs, staged)
}
