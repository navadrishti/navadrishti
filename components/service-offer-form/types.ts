import type { OfferType, PriceType, TransactionType } from '@/lib/service-offers'

export type ServiceOfferFormData = {
  title: string
  description: string
  images: string
  offer_type: OfferType
  transaction_type: TransactionType
  impact_area: string[]
  tags: string
  requirements: string
  city: string
  state_province: string
  pincode: string
  coverage_area: string
  valid_until: string
  price_type: PriceType
  price_amount: number | ''
  unit_rate: number | ''
  billing_cycle: string
  rate_currency: string

  funding_type: string
  budget_amount: number | ''
  disbursement_schedule: string
  funding_window_start: string
  funding_window_end: string
  eligibility_conditions: string

  skills_required: string
  experience_requirements: string
  employment_type: string
  remote_onsite: string
  wage_per_day: number | ''
  hours_per_day: number | ''
  duration: string

  condition: string
  stock_status: string
  material_quantity: number | ''
  material_unit: string
  material_available_from: string
  material_available_to: string

  infra_type: string
  infra_capacity: number | ''
  facilities: string
  infra_available_from: string
  infra_available_to: string
}
