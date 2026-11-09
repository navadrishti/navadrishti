import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client, db: {} }
})

import { emitNeedMarketplaceEvent } from '@/lib/service-requests/marketplace-events'
import { eqsOf, supabaseFake } from './support/supabase-fake'

describe('emitNeedMarketplaceEvent', () => {
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

  it('notifies the NGO and audits when an application is submitted', async () => {
    await emitNeedMarketplaceEvent({
      eventType: 'need_application_submitted',
      applicationId: 9,
      needId: 5,
      needTitle: 'Books for school',
      actorUserId: 14,
      actorDisplayName: 'Ravi',
      recipientUserId: 12,
      relatedUserId: 14,
    })

    const [notification] = supabaseFake.find('user_notifications', 'insert')
    expect(notification.payload).toMatchObject({
      user_id: 12,
      type: 'marketplace_need',
      title: 'New application on your need',
      message: 'Ravi applied to “Books for school”.',
      related_user_id: 14,
      related_entity_type: 'service_request_application',
      related_entity_id: '9',
      action_url: '/service-requests/applicants/5',
    })
    expect(String((notification.payload as { message?: string }).message || '')).not.toMatch(/@|phone|\d{10}/)

    const [audit] = supabaseFake.find('csr_audit_log', 'insert')
    expect(audit.payload).toMatchObject({
      entity_type: 'service_request_application',
      entity_id: '9',
      event_type: 'need_application_submitted',
      event_hash: 'need_application_submitted:9',
      created_by: 14,
      event_payload: expect.objectContaining({
        need_id: 5,
        need_title: 'Books for school',
        actor_user_id: 14,
        recipient_user_id: 12,
      }),
    })
  })

  it.each([
    ['need_application_accepted', 14, '/service-requests/5', 'Application accepted'],
    ['need_application_rejected', 14, '/service-requests/5', 'Application not selected'],
    ['need_work_marked_done', 12, '/service-requests/applicants/5', 'Work marked done'],
    ['need_completion_confirmed', 14, '/service-requests/5', 'Work confirmed complete'],
  ] as const)('emits %s to recipient %s', async (eventType, recipientUserId, actionUrl, title) => {
    await emitNeedMarketplaceEvent({
      eventType,
      applicationId: 9,
      needId: 5,
      needTitle: 'Books',
      actorUserId: recipientUserId === 12 ? 14 : 12,
      actorDisplayName: 'Ravi',
      recipientUserId,
      relatedUserId: recipientUserId === 12 ? 14 : 12,
    })
    expect(supabaseFake.find('user_notifications', 'insert')[0].payload).toMatchObject({
      user_id: recipientUserId,
      title,
      action_url: actionUrl,
    })
    expect(supabaseFake.find('csr_audit_log', 'insert')[0].payload).toMatchObject({
      event_type: eventType,
      event_hash: `${eventType}:9`,
    })
  })

  it('skips duplicate notification and audit when the same event already exists', async () => {
    supabaseFake.reset((query) => {
      if (query.table === 'user_notifications' && query.op === 'select') return { data: { id: 1 } }
      if (query.table === 'csr_audit_log' && query.op === 'select') return { data: { id: 'aud_1' } }
      return undefined
    })
    await emitNeedMarketplaceEvent({
      eventType: 'need_application_accepted',
      applicationId: 9,
      needId: 5,
      needTitle: 'Books',
      actorUserId: 12,
      recipientUserId: 14,
    })
    expect(supabaseFake.find('user_notifications', 'insert')).toHaveLength(0)
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(0)
    expect(eqsOf(supabaseFake.find('user_notifications', 'select')[0])).toMatchObject({
      user_id: 14,
      type: 'marketplace_need',
      related_entity_id: '9',
    })
  })

  it('does not throw when notification insert fails', async () => {
    supabaseFake.reset((query) => {
      if (query.table === 'user_notifications' && query.op === 'select') return { data: null }
      if (query.table === 'user_notifications' && query.op === 'insert') {
        return { error: { message: 'notify down', code: '500' } }
      }
      if (query.table === 'csr_audit_log' && query.op === 'select') return { data: null }
      return undefined
    })
    await expect(
      emitNeedMarketplaceEvent({
        eventType: 'need_application_accepted',
        applicationId: 9,
        needId: 5,
        needTitle: 'Books',
        actorUserId: 12,
        recipientUserId: 14,
      })
    ).resolves.toBeUndefined()
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(1)
  })

  it('ignores invalid ids without writing', async () => {
    await emitNeedMarketplaceEvent({
      eventType: 'need_application_submitted',
      applicationId: 0,
      needId: 5,
      needTitle: 'Books',
      actorUserId: 14,
      recipientUserId: 12,
    })
    expect(supabaseFake.find('user_notifications', 'insert')).toHaveLength(0)
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(0)
  })
})
