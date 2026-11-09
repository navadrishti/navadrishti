/**
 * Live database integration regression for Option B:
 * trg_service_clients_completed must NOT increment Need progress.
 * accepted-trigger cover behaviour must remain.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 * in the process environment, pointing at the dedicated integration-test project.
 * Creates ephemeral rows only; cleans up in afterAll. Does not touch seeded integration data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const EXPECTED_REF = 'czrwdchfkaayeplvnlxz'
const FIXTURE = 'integration_optb_need_progress'

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
const serviceKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const enabled = Boolean(supabaseUrl.includes(EXPECTED_REF) && serviceKey)

describe.skipIf(!enabled)('Integration DB: offer completion Need progress ownership', () => {
  let supabase: SupabaseClient
  let needId: number | null = null
  let offerId: number | null = null
  let clientId: number | null = null
  let coverNeedId: number | null = null
  let coverOfferId: number | null = null
  let coverClientId: number | null = null
  const ownerId = 1
  const ngoId = 10

  beforeAll(() => {
    if (!supabaseUrl.includes(EXPECTED_REF)) {
      throw new Error(`Refusing integration DB test: URL must contain ${EXPECTED_REF}`)
    }
    supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  })

  afterAll(async () => {
    if (!supabase) return
    const clientIds = [clientId, coverClientId].filter((id): id is number => Number.isFinite(id as number))
    const offerIds = [offerId, coverOfferId].filter((id): id is number => Number.isFinite(id as number))
    const needIds = [needId, coverNeedId].filter((id): id is number => Number.isFinite(id as number))
    if (clientIds.length) await supabase.from('service_clients').delete().in('id', clientIds)
    if (offerIds.length) await supabase.from('service_offers').delete().in('id', offerIds)
    if (needIds.length) await supabase.from('service_requests').delete().in('id', needIds)
  })

  it('completed trigger does not increment Need current_amount/quantity', async () => {
    const { data: need, error: needError } = await supabase
      .from('service_requests')
      .insert({
        ngo_id: ngoId,
        title: `${FIXTURE} need completed-no-increment`,
        description: 'Ephemeral Option B regression need',
        category: 'Education',
        status: 'active',
        request_type: 'Skill / Service Need',
        target_amount: 10000,
        current_amount: 100,
        target_quantity: 10,
        current_quantity: 1,
        project_context: { e2e_seed: true, synthetic: true, fixture: FIXTURE },
      })
      .select('id, current_amount, current_quantity')
      .single()
    expect(needError).toBeNull()
    needId = need!.id

    const { data: offer, error: offerError } = await supabase
      .from('service_offers')
      .insert({
        creator_id: ownerId,
        title: `${FIXTURE} offer`,
        description: 'Ephemeral Option B regression offer',
        status: 'inactive',
        admin_status: 'approved',
        is_listed: false,
        offer_type: 'service',
        transaction_type: 'volunteer',
        price_amount: 0,
        offer_details: { e2e_seed: true, fixture: FIXTURE },
      })
      .select('id')
      .single()
    expect(offerError).toBeNull()
    offerId = offer!.id

    const { data: client, error: clientError } = await supabase
      .from('service_clients')
      .insert({
        service_offer_id: offerId,
        client_id: ngoId,
        service_request_id: needId,
        status: 'accepted',
        proposed_amount: 9999,
        fulfilled_amount: 0,
        fulfilled_quantity: 0,
        accepted_at: new Date().toISOString(),
        response_meta: { fixture: FIXTURE },
      })
      .select('id')
      .single()
    expect(clientError).toBeNull()
    clientId = client!.id

    const before = { amount: Number(need!.current_amount), quantity: Number(need!.current_quantity) }

    const { error: completeError } = await supabase
      .from('service_clients')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        fulfilled_amount: 700,
        fulfilled_quantity: 4,
      })
      .eq('id', clientId)
    expect(completeError).toBeNull()

    const { data: afterNeed, error: afterError } = await supabase
      .from('service_requests')
      .select('current_amount, current_quantity, status, is_fulfilled')
      .eq('id', needId)
      .single()
    expect(afterError).toBeNull()
    expect(Number(afterNeed!.current_amount)).toBe(before.amount)
    expect(Number(afterNeed!.current_quantity)).toBe(before.quantity)

    const { data: afterClient } = await supabase
      .from('service_clients')
      .select('fulfilled_amount, fulfilled_quantity, status')
      .eq('id', clientId)
      .single()
    expect(afterClient).toMatchObject({ status: 'completed' })
    expect(Number(afterClient!.fulfilled_amount)).toBe(700)
    expect(Number(afterClient!.fulfilled_quantity)).toBe(4)
  })

  it('accepted trigger still marks covering proposals as fulfilled without incrementing totals', async () => {
    const { data: need, error: needError } = await supabase
      .from('service_requests')
      .insert({
        ngo_id: ngoId,
        title: `${FIXTURE} need accepted-cover`,
        description: 'Ephemeral Option B accepted-branch regression',
        category: 'Education',
        status: 'active',
        request_type: 'Financial Need',
        target_amount: 500,
        current_amount: 50,
        project_context: { e2e_seed: true, synthetic: true, fixture: FIXTURE },
      })
      .select('id, current_amount')
      .single()
    expect(needError).toBeNull()
    coverNeedId = need!.id

    const { data: offer, error: offerError } = await supabase
      .from('service_offers')
      .insert({
        creator_id: ownerId,
        title: `${FIXTURE} offer accepted-cover`,
        description: 'Ephemeral',
        status: 'inactive',
        admin_status: 'approved',
        is_listed: false,
        offer_type: 'financial',
        transaction_type: 'donate',
        price_amount: 500,
        offer_details: { e2e_seed: true, fixture: FIXTURE },
      })
      .select('id')
      .single()
    expect(offerError).toBeNull()
    coverOfferId = offer!.id

    const { data: client, error: clientError } = await supabase
      .from('service_clients')
      .insert({
        service_offer_id: coverOfferId,
        client_id: ngoId,
        service_request_id: coverNeedId,
        status: 'pending',
        proposed_amount: 500,
        response_meta: { fixture: FIXTURE },
      })
      .select('id')
      .single()
    expect(clientError).toBeNull()
    coverClientId = client!.id

    const { error: acceptError } = await supabase
      .from('service_clients')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', coverClientId)
    expect(acceptError).toBeNull()

    const { data: afterNeed, error: afterError } = await supabase
      .from('service_requests')
      .select('current_amount, status, is_fulfilled')
      .eq('id', coverNeedId)
      .single()
    expect(afterError).toBeNull()
    expect(Number(afterNeed!.current_amount)).toBe(50)
    expect(afterNeed!.is_fulfilled).toBe(true)
    expect(String(afterNeed!.status)).toBe('completed')
  })
})

describe('Integration DB gate', () => {
  it('documents skip when integration Supabase env is not configured for navadrishti-test', () => {
    if (enabled) {
      expect(supabaseUrl).toContain(EXPECTED_REF)
      return
    }
    expect(enabled).toBe(false)
  })
})
