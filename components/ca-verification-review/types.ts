import type { CaComplianceTagOption } from '@/lib/auth'
import type { CAFieldComparison, CAReviewDocument } from '@/lib/ca-review-types'

export type CAReviewEntityType = 'individuals' | 'companies' | 'ngos'

export type CAReviewItem = {
  id: number
  user_id?: number
  email?: string
  phone?: string
  verification_status?: string
  submitted_at?: string
  documents?: CAReviewDocument[]
  documents_total?: number
  documents_verified?: number
  ocr_error?: string
  field_comparisons?: CAFieldComparison[]
  name?: string
  aadhaar?: string
  pan?: string
  company_name?: string
  business_description?: string
  gst?: string
  cin?: string
  ngo_name?: string
  ngo_description?: string
  registration_number?: string
  fcra_number?: string
  fcra_expiry?: string
  twelve_a?: string
  twelve_a_expiry?: string
  eighty_g?: string
  eighty_g_expiry?: string
  csr1?: string
  csr1_expiry?: string
  reverification_pending?: boolean
  allotted_compliance_tags?: string[]
  compliance_tag_options?: CaComplianceTagOption[]
}
