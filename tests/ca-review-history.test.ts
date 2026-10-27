import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCaReviewHistoryEntry,
  listCAHistory,
  readCaReviewHistory,
  resolveHistoryKind,
  withCaReviewHistory,
} from '@/lib/ca-review/history'
import type { PlatformCATokenPayload } from '@/lib/platform-ca-auth'
import { createSupabaseFake } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from }, db: {} }))

const ca: PlatformCATokenPayload = { id: 3, ca_id: 'CA-3', username: 'ca3', display_name: 'CA Three' }

beforeEach(() => {
  mocks.from.mockReset()
})

describe('CA review history helpers', () => {
  it('treats a later review of the same account as a resubmission', () => {
    expect(resolveHistoryKind({ isReverification: false, existing: [] })).toBe('verification')
    expect(
      resolveHistoryKind({
        isReverification: false,
        existing: [
          buildCaReviewHistoryEntry({
            at: '2026-01-01T00:00:00Z',
            ca,
            action: 'reject',
            kind: 'verification',
            attempt: 1,
            entity_type: 'companies',
            entity_id: 4,
            user_id: 9,
            stakeholder_name: 'Acme',
            previous_status: 'pending',
            next_status: 'unverified',
          }),
        ],
      })
    ).toBe('resubmission')
    expect(resolveHistoryKind({ isReverification: true, existing: [] })).toBe('reverification')
  })

  it('appends history and indexes the CA id', () => {
    const entry = buildCaReviewHistoryEntry({
      at: '2026-02-01T00:00:00Z',
      ca,
      action: 'approve',
      kind: 'resubmission',
      attempt: 2,
      entity_type: 'individuals',
      entity_id: 4,
      user_id: 9,
      stakeholder_name: 'Ramesh',
      badge: 'ND-CA-1',
      previous_status: 'pending',
      next_status: 'verified',
    })
    const next = withCaReviewHistory({ ca_reviewer_ids: [8] }, entry)
    expect(readCaReviewHistory(next)).toEqual([entry])
    expect(next.ca_reviewer_ids).toEqual([8, 3])
  })

  it('lists only this CA’s decisions, newest first', async () => {
    const fake = createSupabaseFake({
      'users.select': [
        {
          data: [
            {
              id: 9,
              name: 'Ramesh Kumar',
              profile_data: {
                ca_review_history: [
                  { at: '2026-01-01T00:00:00Z', ca_id: 3, action: 'reject', stakeholder_name: 'Ramesh Kumar' },
                  { at: '2026-03-01T00:00:00Z', ca_id: 3, action: 'approve', stakeholder_name: 'Ramesh Kumar' },
                  { at: '2026-02-01T00:00:00Z', ca_id: 8, action: 'approve' },
                ],
              },
            },
          ],
        },
      ],
    })
    mocks.from.mockImplementation(fake.from)
    const entries = await listCAHistory(ca)
    expect(entries.map((entry) => [entry.at, entry.action])).toEqual([
      ['2026-03-01T00:00:00Z', 'approve'],
      ['2026-01-01T00:00:00Z', 'reject'],
    ])
    expect(fake.queries[0].filters).toContainEqual(['contains', 'profile_data', { ca_reviewer_ids: [3] }])
  })
})
