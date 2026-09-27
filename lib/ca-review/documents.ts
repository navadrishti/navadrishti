import { getComplianceDocumentUrl } from '@/lib/auth'
import { reverificationDocumentLabels } from '@/lib/reverification'
import type { CAReviewDocument } from '@/lib/ca-review-types'
import { parseJsonObject } from '@/lib/utils'

function fileNameFromUrl(url: string, fallback: string) {
  try {
    const path = new URL(url).pathname
    const name = decodeURIComponent(path.split('/').pop() || '')
    return name || fallback
  } catch {
    return fallback
  }
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif)$/i.test(url) || url.includes('/image/upload')
}

function documentLabel(key: string) {
  return reverificationDocumentLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim()
}

function documentsFromMap(map: Record<string, unknown>, prefix: string): CAReviewDocument[] {
  return Object.entries(map)
    .map(([key, value]) => {
      const fileUrl = getComplianceDocumentUrl(value)
      if (!/^https?:\/\//i.test(fileUrl)) return null
      return {
        id: `${prefix}-${key}`,
        key,
        label: documentLabel(key),
        file_name: fileNameFromUrl(fileUrl, `${key}.pdf`),
        file_url: fileUrl,
        is_image: isImageUrl(fileUrl),
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
      ...documentsFromMap(parseJsonObject(typeBlock.reverification_documents), `${prefix}-reverify`),
      ...documentsFromMap(parseJsonObject(compliance.pending_reverification), `${prefix}-pending-compliance`),
    ])
  }

  return docs
}
