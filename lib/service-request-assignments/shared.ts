import { supabase } from '@/lib/db'

export async function isFullyVerifiedCompany(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('email_verified, phone_verified, verification_status')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return false

  return Boolean(
    data.email_verified === true &&
    data.phone_verified === true &&
    String(data.verification_status || '').toLowerCase() === 'verified'
  )
}

export const ongoingVolunteerStatuses = ['pending', 'accepted', 'active']
export const historyVolunteerStatuses = ['completed', 'rejected', 'cancelled']
export const actionableProjectApplicationStatuses = ['pending', 'pledged', 'accepted', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned']
export const reviewQueueProjectApplicationStatuses = ['pending', 'pledged', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned']

export const COMPANY_PROJECT_CONTRIBUTION_TYPE = 'company_project_csr'
export const LEAD_NGO_INVITE_CONTRIBUTION_TYPE = 'project_lead_ngo_invite'
export const EXPIRED_STATUS = 'expired'

type AssignmentMeta = { project_id?: unknown; note?: unknown }

export function safeProjectIdFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null
  const value = String((meta as AssignmentMeta).project_id || '').trim()
  return value || null
}

export function safeNoteFromMeta(meta: unknown): string {
  if (!meta || typeof meta !== 'object') return ''
  return String((meta as AssignmentMeta).note || '').trim()
}

export function safeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase())
  return false
}

export type AssignmentsGetContext = {
  searchParams: URLSearchParams
  userId: number
  userType: string
}

export type AssignmentsPutContext = {
  body: Record<string, unknown>
  userId: number
  userType: string
}
