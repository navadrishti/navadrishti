import type { CAQueueType } from '@/lib/ca-review-types'

export type CAReviewHistoryKind = 'verification' | 'resubmission' | 'reverification'

export type CAReviewHistoryEntry = {
  at: string
  ca_id: number
  ca_name: string
  action: 'approve' | 'reject'
  kind: CAReviewHistoryKind
  attempt: number
  entity_type: CAQueueType
  entity_id: number
  user_id: number
  stakeholder_name: string
  reason: string | null
  badge: string | null
  previous_status: string
  next_status: string
}
