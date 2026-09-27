import { getServiceRequestTarget } from '@/lib/service-request-allocation'
import type { ServiceRequest, Volunteer, VolunteerApplicationResponse } from './types'

export function normalizeVolunteer(raw: VolunteerApplicationResponse): Volunteer {
  const volunteer: NonNullable<VolunteerApplicationResponse['volunteer']> =
    raw?.volunteer && typeof raw.volunteer === 'object' ? raw.volunteer : {}

  return {
    id: Number(raw.id),
    applicant_user_id: Number(raw.applicant_user_id),
    volunteer_name: String(volunteer.name || raw.volunteer_name || 'Volunteer'),
    volunteer_email: String(volunteer.email || raw.volunteer_email || ''),
    volunteer_type: (volunteer.user_type || raw.volunteer_type || 'individual') as Volunteer['volunteer_type'],
    volunteer_verification_status: String(volunteer.verification_status || raw.volunteer_verification_status || ''),
    message: String(raw.application_message || raw.message || ''),
    status: raw.status,
    applied_at: raw.applied_at || raw.created_at || '',
    start_date: raw.start_date,
    end_date: raw.end_date,
    hours_contributed: Number(raw.hours_contributed || 0),
    fulfillment_amount: raw.fulfillment_amount,
    fulfillment_quantity: raw.fulfillment_quantity,
    assigned_amount: raw.assigned_amount,
    assigned_quantity: raw.assigned_quantity,
    response_meta: raw.response_meta,
  }
}

export function isDeliverableNeed(request: ServiceRequest | null) {
  const category = String(request?.category || '').toLowerCase()
  return category.includes('material') || category.includes('deliver')
}

export function formatVolunteerOffer(request: ServiceRequest | null, volunteer: Volunteer) {
  const target = getServiceRequestTarget(request)
  if (target.isFinancial) {
    const amount = Number(volunteer.fulfillment_amount ?? volunteer.assigned_amount ?? 0)
    return amount > 0 ? `INR ${amount.toLocaleString('en-IN')}` : 'Amount not set'
  }

  const quantity = Number(volunteer.fulfillment_quantity ?? volunteer.assigned_quantity ?? 0)
  return quantity > 0 ? `${quantity} units` : 'Quantity not set'
}

export function formatDate(value?: string | null) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-IN', { timeZone: 'UTC' })
}
