export interface NgoCompliance {
  verified: boolean
  csr1: boolean
  section_12a: boolean
  section_80g: boolean
  fcra: boolean
  section_8: boolean
}

export interface NetworkNgo {
  id: number
  name: string
  email: string
  phone: string | null
  profile_image: string | null
  cover_image?: string | null
  location: string | null
  sector: string | null
  sectors_schedule_vii?: string[]
  registration_type: string | null
  execution_capacity: string | null
  size: string | null
  mission: string | null
  past_projects_count: number
  projects_completed_count: number
  projects_ongoing_count: number
  projects_active_count: number
  geographic_coverage_preview: string | null
  compliance: NgoCompliance
  ca_badge_number?: string | null
  ca_compliance_tags?: string[]
  accepts_payments?: boolean
  csr_eligible?: boolean
}

export interface NgoViewerContext {
  canPay: boolean
  payerCaVerified: boolean
  isNgoViewer: boolean
  userId?: number
  userType?: string
  onPay: (ngo: NetworkNgo) => void
}
