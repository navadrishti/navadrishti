export const CA_QUEUE_TYPES = ['individuals', 'companies', 'ngos'] as const

export type CAQueueType = (typeof CA_QUEUE_TYPES)[number]

export type CAReviewDocument = {
  id: string
  key: string
  label: string
  file_name: string
  file_url: string
  is_image: boolean
  ocr_fields: { label: string; value: string }[]
  ocr_status?: 'pending' | 'completed' | 'failed' | 'skipped'
}

export type CAFieldComparisonSource = {
  document: string
  value: string
  origin: 'input' | 'document'
  deviation: boolean
}

export type CAFieldComparison = {
  field: string
  sources: CAFieldComparisonSource[]
  match: boolean
  status: 'match' | 'mismatch' | 'incomplete'
  deviations: string[]
}
