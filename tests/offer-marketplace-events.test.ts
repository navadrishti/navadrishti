import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client, db: {} }
})

import {
  emitOfferCreatedAudit,
  emitOfferMarketplaceEvent,
} from '@/lib/service-offers/marketplace-events'
import { eqsOf, supabaseFake } from './support/supabase-fake'

describe('emitOfferMarketplaceEvent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    supabaseFake.reset((query) => {
      if (query.table === 'user_notifications' && query.op === 'select') return { data: null }
      if (query.table === 'csr_audit_log' && query.op === 'select') return { data: null }
      return undefined
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('notifies the offer owner and audits when a request is submitted', async () => {
    await emitOfferMarketplaceEvent({
      eventType: 'offer_request_submitted',
      applicationId: 15,
      offerId: 3,
      offerTitle: 'Teaching volunteers',
      actorUserId: 10,
      actorDisplayName: 'E2E NGO Society',
      recipientUserId: 1,
      relatedUserId: 10,
    })

    const [notification] = supabaseFake.find('user_notifications', 'insert')
    expect(notification.payload).toMatchObject({
      user_id: 1,
      type: 'marketplace_offer',
      title: 'New request on your capability offer',
      message: 'E2E NGO Society requested “Teaching volunteers”.',
      related_user_id: 10,
      related_entity_type: 'service_client',
      related_entity_id: '15',
      action_url: '/service-offers/3',
    })
    expect(String((notification.payload as { message?: string }).message || '')).not.toMatch(/@|rzp_|acc_/)

    const [audit] = supabaseFake.find('csr_audit_log', 'insert')
    expect(audit.payload).toMatchObject({
      entity_type: 'service_client',
      entity_id: '15',
      event_type: 'offer_request_submitted',
      event_hash: 'offer_request_submitted:15',
      created_by: 10,
      event_payload: expect.objectContaining({
        offer_id: 3,
        offer_title: 'Teaching volunteers',
        actor_user_id: 10,
        recipient_user_id: 1,
      }),
    })
  })

  it.each([
    ['offer_request_accepted', 10, 'Capability request accepted'],
    ['offer_request_rejected', 10, 'Capability request not selected'],
  ] as const)('emits %s to requester %s', async (eventType, recipientUserId, title) => {
    await emitOfferMarketplaceEvent({
      eventType,
      applicationId: 15,
      offerId: 3,
      offerTitle: 'Van rental',
      actorUserId: 1,
      recipientUserId,
      relatedUserId: 1,
    })
    expect(supabaseFake.find('user_notifications', 'insert')[0].payload).toMatchObject({
      user_id: recipientUserId,
      title,
      action_url: '/service-offers/3',
    })
    expect(supabaseFake.find('csr_audit_log', 'insert')[0].payload).toMatchObject({
      event_type: eventType,
      event_hash: `${eventType}:15`,
      created_by: 1,
    })
  })

  it('notifies each completion recipient and audits fulfilment once', async () => {
    await emitOfferMarketplaceEvent({
      eventType: 'offer_fulfilment_completed',
      applicationId: 15,
      offerId: 3,
      offerTitle: 'Van rental',
      actorUserId: 1,
      recipientUserId: 1,
      relatedUserId: 10,
    })
    supabaseFake.reset((query) => {
      if (query.table === 'user_notifications' && query.op === 'select') return { data: null }
      if (query.table === 'csr_audit_log' && query.op === 'select') {
        return { data: { id: 'existing_audit' } }
      }
      return undefined
    })
    await emitOfferMarketplaceEvent({
      eventType: 'offer_fulfilment_completed',
      applicationId: 15,
      offerId: 3,
      offerTitle: 'Van rental',
      actorUserId: 1,
      recipientUserId: 10,
      relatedUserId: 1,
    })

    expect(supabaseFake.find('user_notifications', 'insert')).toHaveLength(1)
    expect(supabaseFake.find('user_notifications', 'insert')[0].payload).toMatchObject({
      user_id: 10,
      title: 'Capability engagement completed',
    })
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(0)
  })

  it('skips duplicate notification and audit when the same event already exists', async () => {
    supabaseFake.reset((query) => {
      if (query.table === 'user_notifications' && query.op === 'select') return { data: { id: 1 } }
      if (query.table === 'csr_audit_log' && query.op === 'select') return { data: { id: 'aud_1' } }
      return undefined
    })
    await emitOfferMarketplaceEvent({
      eventType: 'offer_request_accepted',
      applicationId: 15,
      offerId: 3,
      offerTitle: 'Van',
      actorUserId: 1,
      recipientUserId: 10,
    })
    expect(supabaseFake.find('user_notifications', 'insert')).toHaveLength(0)
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(0)
    expect(eqsOf(supabaseFake.find('user_notifications', 'select')[0])).toMatchObject({
      user_id: 10,
      type: 'marketplace_offer',
      related_entity_id: '15',
    })
  })

  it('does not throw when notification insert fails and still attempts audit', async () => {
    supabaseFake.reset((query) => {
      if (query.table === 'user_notifications' && query.op === 'select') return { data: null }
      if (query.table === 'user_notifications' && query.op === 'insert') {
        return { error: { message: 'notify down', code: '500' } }
      }
      if (query.table === 'csr_audit_log' && query.op === 'select') return { data: null }
      return undefined
    })
    await expect(
      emitOfferMarketplaceEvent({
        eventType: 'offer_request_accepted',
        applicationId: 15,
        offerId: 3,
        offerTitle: 'Van',
        actorUserId: 1,
        recipientUserId: 10,
      })
    ).resolves.toBeUndefined()
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(1)
    expect(console.error).toHaveBeenCalled()
  })

  it('logs audit failure without throwing', async () => {
    supabaseFake.reset((query) => {
      if (query.table === 'user_notifications' && query.op === 'select') return { data: null }
      if (query.table === 'csr_audit_log' && query.op === 'select') return { data: null }
      if (query.table === 'csr_audit_log' && query.op === 'insert') {
        return { error: { message: 'audit down', code: '500' } }
      }
      return undefined
    })
    await expect(
      emitOfferMarketplaceEvent({
        eventType: 'offer_request_rejected',
        applicationId: 15,
        offerId: 3,
        offerTitle: 'Van',
        actorUserId: 1,
        recipientUserId: 10,
      })
    ).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  it('ignores invalid ids without writing', async () => {
    await emitOfferMarketplaceEvent({
      eventType: 'offer_request_submitted',
      applicationId: 0,
      offerId: 3,
      offerTitle: 'Van',
      actorUserId: 10,
      recipientUserId: 1,
    })
    expect(supabaseFake.find('user_notifications', 'insert')).toHaveLength(0)
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(0)
  })
})

describe('emitOfferCreatedAudit', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    supabaseFake.reset((query) => {
      if (query.table === 'csr_audit_log' && query.op === 'select') return { data: null }
      return undefined
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes an offer_created audit entry without a notification', async () => {
    await emitOfferCreatedAudit({
      offerId: 44,
      offerTitle: 'Skill workshop',
      actorUserId: 1,
    })
    expect(supabaseFake.find('user_notifications', 'insert')).toHaveLength(0)
    expect(supabaseFake.find('csr_audit_log', 'insert')[0].payload).toMatchObject({
      entity_type: 'service_offer',
      entity_id: '44',
      event_type: 'offer_created',
      event_hash: 'offer_created:44',
      created_by: 1,
      event_payload: expect.objectContaining({ offer_id: 44, offer_title: 'Skill workshop' }),
    })
  })

  it('skips duplicate offer_created audits', async () => {
    supabaseFake.reset((query) => {
      if (query.table === 'csr_audit_log' && query.op === 'select') return { data: { id: 'x' } }
      return undefined
    })
    await emitOfferCreatedAudit({ offerId: 44, offerTitle: 'Skill workshop', actorUserId: 1 })
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(0)
  })
})
