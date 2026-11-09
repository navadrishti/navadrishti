import 'server-only'

import { supabase } from '@/lib/db'
import type { PlatformCATokenPayload } from '@/lib/platform-ca-auth'
import type { CAQueueType } from '@/lib/ca-review-types'
import { parseJsonObject, type JsonRecord } from '@/lib/utils'
import type { Json } from '@/lib/database.types'
import type { CAReviewHistoryEntry, CAReviewHistoryKind } from './history-types'

export type { CAReviewHistoryEntry, CAReviewHistoryKind } from './history-types'

function asHistoryList(value: unknown): CAReviewHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is CAReviewHistoryEntry => {
    if (!entry || typeof entry !== 'object') return false
    const row = entry as Partial<CAReviewHistoryEntry>
    return typeof row.at === 'string' && typeof row.ca_id === 'number' && typeof row.action === 'string'
  })
}

function asReviewerIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is number => Number.isInteger(id) && id > 0))]
}

export function readCaReviewHistory(profileData: unknown): CAReviewHistoryEntry[] {
  return asHistoryList(parseJsonObject(profileData).ca_review_history)
}

export function resolveHistoryKind(options: {
  isReverification: boolean
  existing: CAReviewHistoryEntry[]
}): CAReviewHistoryKind {
  if (options.isReverification) return 'reverification'
  return options.existing.length > 0 ? 'resubmission' : 'verification'
}

export function withCaReviewHistory(profileData: unknown, entry: CAReviewHistoryEntry): JsonRecord {
  const current = parseJsonObject(profileData)
  const history = [...readCaReviewHistory(current), entry]
  return {
    ...current,
    ca_review_history: history,
    ca_reviewer_ids: [...new Set([...asReviewerIds(current.ca_reviewer_ids), entry.ca_id])],
  }
}

export function buildCaReviewHistoryEntry(options: {
  at: string
  ca: PlatformCATokenPayload
  action: 'approve' | 'reject'
  kind: CAReviewHistoryKind
  attempt: number
  entity_type: CAQueueType
  entity_id: number
  user_id: number
  stakeholder_name: string
  reason?: string
  badge?: string | null
  previous_status: string
  next_status: string
}): CAReviewHistoryEntry {
  return {
    at: options.at,
    ca_id: options.ca.id,
    ca_name: options.ca.display_name || options.ca.username,
    action: options.action,
    kind: options.kind,
    attempt: options.attempt,
    entity_type: options.entity_type,
    entity_id: options.entity_id,
    user_id: options.user_id,
    stakeholder_name: options.stakeholder_name,
    reason: options.action === 'reject' ? options.reason || '' : null,
    badge: options.badge || null,
    previous_status: options.previous_status,
    next_status: options.next_status,
  }
}

export async function persistCaReviewHistory(userId: number, entry: CAReviewHistoryEntry) {
  const { data, error } = await supabase.from('users').select('profile_data').eq('id', userId).maybeSingle()
  if (error || !data) {
    if (error) console.error('Failed to load profile before saving CA history:', error)
    return
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({
      profile_data: withCaReviewHistory(data.profile_data, entry) as Json,
      updated_at: entry.at,
    })
    .eq('id', userId)

  if (updateError) {
    console.error('Failed to persist CA review history:', updateError)
  }
}

export async function listCAHistory(ca: PlatformCATokenPayload): Promise<CAReviewHistoryEntry[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, user_type, verification_status, profile_data')
    .contains('profile_data', { ca_reviewer_ids: [ca.id] })
    .order('updated_at', { ascending: false })
    .limit(300)

  if (error) {
    console.error('CA history query failed:', error)
    throw error
  }

  const entries = (data || []).flatMap((user) => {
    const name = String(user.name || '').trim()
    return readCaReviewHistory(user.profile_data)
      .filter((entry) => entry.ca_id === ca.id)
      .map((entry) => ({
        ...entry,
        user_id: user.id,
        stakeholder_name: entry.stakeholder_name || name,
      }))
  })

  return entries.sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
}
