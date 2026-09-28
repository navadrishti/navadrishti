export type ServiceOfferLite = {
  id: number
  title: string
  description?: string | null
  offer_type?: string | null
  transaction_type?: string | null
  amount?: number | string | null
  sell_amount?: number | string | null
  quantity?: number | string | null
  capacity?: number | string | null
  item?: string | null
  skill?: string | null
  scope?: string | null
  status?: string | null
  ngo_name?: string | null
  provider_name?: string | null
  verified?: boolean | null
  verification_status?: string | null
}

export type CoverageLabel = 'full' | 'partial' | 'possible'

export type NeedRecommendation = {
  offer: ServiceOfferLite
  score: number
  coverageRatio: number | null
  coverageLabel: CoverageLabel
  rationale: string
  matched_keywords?: string[]
  matched_phrases?: string[]
  matched_fields?: string[]
  vector_similarity?: number
}

export type ServerRecommendation = {
  id: number | string
  title: string
  provider_name?: string | null
  verification_status?: string | null
  verified?: boolean | null
  score?: number | string | null
  coverageRatio?: unknown
  rationale?: string | null
  matched_keywords?: unknown
  matched_phrases?: unknown
  matched_fields?: unknown
  vector_similarity?: unknown
}

export type NeedDraft = {
  title: string
  description: string
  images: string
  request_type: string
  category: string
  location: string
  urgency: string
  timeline: string
  budget: string
  estimated_budget: string
  beneficiary_count: string
  impact_description: string
  contactInfo: string
  target_amount: string
  target_quantity: string
  current_amount: string
  current_quantity: string
  material_items: string
  skill_role: string
  skill_duration: string
  infrastructure_scope: string
}

export type AIGeneratedNeed = Omit<Partial<NeedDraft>, 'images'> & { images?: string | string[] }

export type AIGeneratedDraft = {
  source?: string
  projectMode?: 'new' | 'existing'
  project?: {
    title?: string
    description?: string
    location?: string
    timeline?: string
    category?: string
  }
  needs?: AIGeneratedNeed[]
}

export type UploadProgressState = {
  active: boolean
  current: number
  total: number
}
