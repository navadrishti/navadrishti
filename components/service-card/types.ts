export interface ServiceCardProps {
  id: number
  title: string
  description: string
  category: string
  location?: string
  images?: string[]
  ngo_name: string
  creator_id?: number
  ngo_id?: number
  provider?: string
  providerType?: string
  verified?: boolean
  tags?: string[]
  created_at: string

  urgency_level?: 'low' | 'medium' | 'high' | 'critical'
  priority?: string
  volunteers_needed?: number
  timeline?: string
  deadline?: string
  requirements?: string | object
  current_amount?: number | string | null
  impact_score?: number

  price_amount?: number
  price_type?: 'fixed' | 'negotiable' | 'project_based' | 'hourly'
  price_description?: string
  transaction_type?: 'sell' | 'rent' | 'volunteer' | string
  status?: string
  offer_type?: 'financial' | 'material' | 'service' | 'infrastructure' | string
  amount?: number | null
  location_scope?: string | null
  conditions?: string | null
  item?: string | null
  quantity?: number | null
  delivery_scope?: string | null
  project?: {
    id?: string
    title?: string
    location?: string
    timeline?: string
  }
  skill?: string | null
  capacity?: number | null
  duration?: string | null
  scope?: string | null
  wage_info?: {
    min_amount?: number
    max_amount?: number
    currency?: string
    payment_frequency?: string
    negotiable?: boolean
    offer_type?: string
    capacity_limit?: string
    coverage_area?: string
    category_focus?: string
    validity_period?: string
  }
  employment_type?: string
  experience_requirements?: {
    level?: string
    years_required?: number
    specific_skills?: string[]
  }
  skills_required?: string[]
  benefits?: string[]
  currentTime?: number

  type: 'request' | 'offer'
  onDelete?: () => void
  isDeleting?: boolean
  showDeleteButton?: boolean
  isOwner?: boolean
  canInteract?: boolean

  volunteer_application?: {
    status: string
    applied_at: string
    response_meta?: {
      ngo_decision_comment?: string | null
    }
  }
}

export type RequestProjectContext = NonNullable<ServiceCardProps['project']> & {
  category?: string
  expected_beneficiaries?: number | string
  valid_until?: string
}

export type RequestRequirements = {
  description?: string
  project_category?: string
  beneficiary_count?: number | string
  timeline?: string
  project?: {
    project?: RequestProjectContext
  }
}
