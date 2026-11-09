export const CA_QUEUE_TYPES = ['individuals', 'companies', 'ngos'] as const

export type CAQueueType = (typeof CA_QUEUE_TYPES)[number]

/** Returns a literal queue key so request strings never reach logs or queries. */
export function parseCAQueueType(value: unknown): CAQueueType | null {
  if (value === 'individuals') return 'individuals'
  if (value === 'companies') return 'companies'
  if (value === 'ngos') return 'ngos'
  return null
}

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
