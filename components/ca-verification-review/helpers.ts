import type { ComplianceBadgeKind } from '@/components/verification-badge'
import type { CAFieldComparison, CAReviewDocument } from '@/lib/ca-review-types'
import type { CAReviewEntityType } from './types'

export function complianceTagBadgeKind(key: string): ComplianceBadgeKind | null {
  if (key === 'twelve_a' || key === 'eighty_g' || key === 'csr1' || key === 'fcra') return key
  return null
}

export function isDocumentImageUrl(url: string, fileName = '') {
  return (
    /\.(png|jpe?g|webp|gif)$/i.test(url) ||
    /\.(png|jpe?g|webp|gif)$/i.test(fileName) ||
    url.includes('/image/upload')
  )
}

export function isDocumentPdfUrl(url: string, fileName = '') {
  return /pdf/i.test(url) || /\.pdf$/i.test(fileName) || url.includes('/raw/upload')
}

function entityLabel(type: CAReviewEntityType) {
  if (type === 'companies') return 'company'
  if (type === 'ngos') return 'NGO'
  return 'individual'
}

export function caReviewDescription(type: CAReviewEntityType) {
  return `Review and verify this ${entityLabel(type)}'s details`
}

export function isCaReviewLocked(item: Record<string, unknown> | null | undefined) {
  return (
    String(item?.verification_status || '').toLowerCase() === 'verified' &&
    !item?.reverification_pending
  )
}

export function comparisonResult(row: CAFieldComparison) {
  if (row.status === 'match' || row.match) return { text: 'Match', className: 'text-green-700' }
  if (row.status === 'incomplete') return { text: 'Incomplete', className: 'text-slate-600' }
  const where = Array.isArray(row.deviations) && row.deviations.length > 0
    ? ` in ${row.deviations.join(', ')}`
    : ''
  return { text: `Mismatch${where}`, className: 'text-red-700' }
}

export function sourceEmptyLabel(source: { origin?: string }) {
  return source.origin === 'input' ? 'Not set' : 'Not found on document'
}

export function comparedDocumentNames(row: CAFieldComparison, fallbackDocs: CAReviewDocument[]) {
  const sources = Array.isArray(row.sources) ? row.sources : []
  const names = sources.map((source) => source.document).filter(Boolean)
  if (names.length > 0) return names
  return fallbackDocs.map((doc) => doc.label).filter(Boolean)
}

export function isExpiryOcrLabel(label: string) {
  return /expir|valid until|valid till|valid upto|validity/i.test(label)
}
