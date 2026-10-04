import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseFake, type FakeQuery } from './support/supabase-fake'
import {
  assertCampaignDeletable,
  CampaignDeleteBlockedError,
  deleteCampaignWithDependencies,
  formatCampaignDeleteError,
} from '@/lib/campaign-delete'

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client }
})

const deletes = () =>
  supabaseFake.queries
    .filter((query) => query.op === 'delete')
    .map((query) => {
      const filter = query.calls.find((call) => call[0] === 'in' || call[0] === 'eq')
      return [query.table, filter?.[1], filter?.[2]]
    })

beforeEach(() => {
  supabaseFake.reset()
})

describe('deleteCampaignWithDependencies', () => {
  it('deletes only the campaign when it has no projects', async () => {
    supabaseFake.respondWith(() => ({ data: [] }))
    await deleteCampaignWithDependencies('c1')
    expect(deletes()).toEqual([['campaigns', 'id', 'c1']])
  })

  it('removes dependents before projects and the campaign', async () => {
    supabaseFake.respondWith((query: FakeQuery) => {
      if (query.op !== 'select') return { data: null }
      if (query.table === 'csr_projects') return { data: [{ id: 'p1' }] }
      if (query.table === 'csr_project_milestones') return { data: [{ id: 'm1' }] }
      if (query.table === 'csr_milestone_evidence') return { data: [{ id: 'e1' }] }
      if (query.table === 'csr_payment_confirmations') {
        const byMilestone = query.calls.some((call) => call[1] === 'milestone_id')
        return { data: byMilestone ? [{ id: 'pay1' }] : [{ id: 'pay1' }, { id: 'pay2' }] }
      }
      return { data: [] }
    })

    await deleteCampaignWithDependencies('c1')

    const order = deletes()
    expect(order[0]).toEqual(['company_ca_action_log', 'payment_confirmation_id', ['pay1', 'pay2']])
    expect(order).toContainEqual(['csr_milestone_evidence_media', 'evidence_id', ['e1']])
    expect(order.at(-2)).toEqual(['csr_projects', 'id', ['p1']])
    expect(order.at(-1)).toEqual(['campaigns', 'id', 'c1'])
  })

  it('throws when a lookup fails', async () => {
    const failure = { code: '42P01', message: 'boom' }
    supabaseFake.respondWith(() => ({ error: failure }))
    await expect(deleteCampaignWithDependencies('c1')).rejects.toBe(failure)
    expect(deletes()).toEqual([])
  })

  it('throws when the campaign delete fails', async () => {
    const failure = { code: '23503' }
    supabaseFake.respondWith((query) => (query.op === 'delete' ? { error: failure } : { data: [] }))
    await expect(deleteCampaignWithDependencies('c1')).rejects.toBe(failure)
  })
})

describe('assertCampaignDeletable', () => {
  it('allows a campaign with no money moved', async () => {
    supabaseFake.respondWith((query) => (query.table === 'csr_projects' ? { data: [{ id: 'p1' }] } : { data: null, count: 0 }))
    await expect(assertCampaignDeletable({ id: 'c1', impact_metrics: {} })).resolves.toBeUndefined()
  })

  it('blocks a campaign with a paid capability rental', async () => {
    const impact = { csr_capability_rentals: [{ id: 'c1:7', service_offer_id: 7, payment_status: 'paid' }] }
    await expect(assertCampaignDeletable({ id: 'c1', impact_metrics: impact })).rejects.toBeInstanceOf(CampaignDeleteBlockedError)
    expect(supabaseFake.queries).toHaveLength(0)
  })

  it('blocks a campaign with confirmed milestone payments', async () => {
    supabaseFake.respondWith((query) => (query.table === 'csr_projects' ? { data: [{ id: 'p1' }] } : { data: null, count: 2 }))
    await expect(assertCampaignDeletable({ id: 'c1', impact_metrics: {} })).rejects.toThrow('confirmed milestone payments')
  })
})

describe('formatCampaignDeleteError', () => {
  it.each([
    [{ code: '23503', message: 'fk' }, 'This campaign is still linked to other records and could not be deleted.'],
    [{ message: 'Nope' }, 'Nope'],
    [{ message: '   ' }, 'Failed to delete campaign'],
    [new Error('Campaign not found'), 'Campaign not found'],
    [null, 'Failed to delete campaign'],
    ['text', 'Failed to delete campaign'],
  ])('%j -> %s', (error, expected) => {
    expect(formatCampaignDeleteError(error)).toBe(expected)
  })
})
