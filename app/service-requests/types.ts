import type { ComponentProps } from 'react'
import type { ServiceCard } from '@/components/service-card'
import type { Tables } from '@/lib/database.types'

export type ListingKind = 'needs' | 'projects'

export type ServiceRequestListing = Pick<
  ComponentProps<typeof ServiceCard>,
  | 'id'
  | 'title'
  | 'description'
  | 'category'
  | 'location'
  | 'images'
  | 'ngo_name'
  | 'ngo_id'
  | 'verified'
  | 'tags'
  | 'created_at'
  | 'urgency_level'
  | 'volunteers_needed'
  | 'timeline'
  | 'deadline'
  | 'requirements'
  | 'current_amount'
  | 'impact_score'
  | 'project'
> & {
  accepted_volunteers_count?: number | null
  volunteers_count?: number | null
}

export type ProjectListing = Tables<'service_request_projects'> & {
  category?: string | null
  budget_inr?: number | null
  ngo_name?: string
  ngo_verified?: boolean
  ngo_location?: string | null
  formatted_address?: string | null
  location_summary?: string | null
}
