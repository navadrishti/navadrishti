'use client'

import type { CAFieldComparison, CAReviewDocument } from '@/lib/ca-review-types'
import { BasicInformationCard } from './ca-verification-review/basic-information-card'
import { ComparisonCard } from './ca-verification-review/comparison-card'
import { ComplianceTagsCard } from './ca-verification-review/compliance-tags-card'
import { DocumentFieldsCard } from './ca-verification-review/document-fields-card'
import { DocumentsCard } from './ca-verification-review/documents-card'
import type { CAReviewEntityType, CAReviewItem } from './ca-verification-review/types'

export { DocumentFileViewer } from './ca-verification-review/document-file-viewer'
export { caReviewDescription, isCaReviewLocked } from './ca-verification-review/helpers'
export type { CAReviewItem } from './ca-verification-review/types'

export function CAVerificationReview({
  item,
  type,
  ocrLoading = false,
  complianceTags,
  onComplianceTagsChange,
  readOnly = false,
}: {
  item: CAReviewItem
  type: CAReviewEntityType
  ocrLoading?: boolean
  complianceTags?: string[]
  onComplianceTagsChange?: (tags: string[]) => void
  readOnly?: boolean
}) {
  const documents: CAReviewDocument[] = Array.isArray(item.documents) ? item.documents : []
  const comparisons: CAFieldComparison[] = Array.isArray(item.field_comparisons)
    ? item.field_comparisons
    : []
  const showOcr = documents.length > 0 || ocrLoading

  return (
    <>
      <BasicInformationCard item={item} type={type} />

      {type === 'ngos' ? (
        <ComplianceTagsCard
          options={item.compliance_tag_options}
          reverificationPending={item.reverification_pending}
          complianceTags={complianceTags}
          onComplianceTagsChange={onComplianceTagsChange}
          readOnly={readOnly}
          ocrLoading={ocrLoading}
        />
      ) : null}

      <DocumentsCard key={item.id} documents={documents} />

      {showOcr && (
        <DocumentFieldsCard documents={documents} ocrLoading={ocrLoading} ocrError={item.ocr_error} />
      )}

      {showOcr && (
        <ComparisonCard comparisons={comparisons} documents={documents} ocrLoading={ocrLoading} />
      )}
    </>
  )
}
