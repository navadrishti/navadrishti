import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client, db: {} }
})

import { removeServiceOfferSafely } from '@/lib/service-offers/lifecycle'
import { autoRejectExpiredServiceOffers } from '@/lib/admin-offer-automation'
import { supabaseFake } from './support/supabase-fake'

beforeEach(() => {
  supabaseFake.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('obsolete offer moderation endpoints', () => {
  it('no longer ships admin review or auto-reject route modules', () => {
    const review = path.join(
      process.cwd(),
      'app/api/admin/service-offers/[offerId]/review/route.ts'
    )
    const autoReject = path.join(process.cwd(), 'app/api/admin/service-offers/auto-reject/route.ts')
    expect(fs.existsSync(review)).toBe(false)
    expect(fs.existsSync(autoReject)).toBe(false)
  })

  it('keeps the automation helper as a no-op', async () => {
    await expect(autoRejectExpiredServiceOffers()).resolves.toEqual({
      rejectedCount: 0,
      rejectedOffers: [],
    })
  })
})

describe('removeServiceOfferSafely', () => {
  it('archives when any application exists', async () => {
    supabaseFake.reset({
      'service_offers.select': [{ data: { id: 3, creator_id: 40, status: 'active' } }],
      'service_clients.select': [{ data: { id: 9 } }],
      'service_offers.update': [{ data: { id: 3 } }],
      'csr_audit_log.insert': [{ data: { id: 1 } }],
    })
    await expect(removeServiceOfferSafely({ offerId: 3, actorUserId: 40, requireCreatorId: 40 }))
      .resolves.toEqual({ ok: true, mode: 'archived' })
    expect(supabaseFake.writes('service_offers', 'update')[0].payload).toEqual(
      expect.objectContaining({ status: 'inactive' })
    )
  })

  it('hard-deletes when unused', async () => {
    supabaseFake.reset({
      'service_offers.select': [{ data: { id: 3, creator_id: 40, status: 'active' } }],
      'service_clients.select': [{ data: null }],
      'service_offers.delete': [{ data: { id: 3 } }],
      'csr_audit_log.insert': [{ data: { id: 1 } }],
    })
    await expect(removeServiceOfferSafely({ offerId: 3, actorUserId: 40, requireCreatorId: 40 }))
      .resolves.toEqual({ ok: true, mode: 'deleted' })
  })
})
