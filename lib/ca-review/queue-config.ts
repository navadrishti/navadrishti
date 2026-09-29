import type { CAFieldComparison, CAQueueType, CAReviewDocument } from '@/lib/ca-review-types'
import { parseJsonObject } from '@/lib/utils'

export type VerificationQueueRow = {
  id: number
  user_id: number
  verification_status: string | null
  created_at: string | null
  updated_at: string | null
  users: unknown
  aadhaar_number?: string | null
  pan_number?: string | null
  company_name?: string | null
  gst_number?: string | null
  ngo_name?: string | null
  registration_number?: string | null
  fcra_number?: string | null
}

export type CAQueueItem = {
  id: number
  user_id: number
  verification_status: string
  documents: CAReviewDocument[]
  documents_total: number
  ocr_error: string
  reverification_pending?: boolean
  field_comparisons?: CAFieldComparison[]
  [key: string]: unknown
}

export const TYPE_CONFIG: Record<
  CAQueueType,
  {
    table: 'individual_verifications' | 'company_verifications' | 'ngo_verifications'
    profileKey: 'individual' | 'company' | 'ngo'
  }
> = {
  individuals: { table: 'individual_verifications', profileKey: 'individual' },
  companies: { table: 'company_verifications', profileKey: 'company' },
  ngos: { table: 'ngo_verifications', profileKey: 'ngo' },
}

const USER_SELECT = 'users ( id, name, email, phone, work_experience, industry, profile_image, profile_data, verification_status )'

export function selectColumns(type: CAQueueType) {
  if (type === 'individuals') {
    return `
      id, user_id, verification_status, aadhaar_number, pan_number, verification_date, created_at, updated_at,
      ${USER_SELECT}
    `
  }
  if (type === 'companies') {
    return `
      id, user_id, verification_status, company_name, gst_number, registration_number, sector, verification_date, created_at, updated_at,
      ${USER_SELECT}
    `
  }
  return `
    id, user_id, verification_status, ngo_name, registration_number, registration_type, fcra_number, sector, verification_date, created_at, updated_at,
    ${USER_SELECT}
  `
}

export function unwrapUser(value: unknown) {
  if (Array.isArray(value)) return parseJsonObject(value[0])
  return parseJsonObject(value)
}
