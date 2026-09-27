import { parseCsrCapabilityRentals, type CsrCapabilityRentalRecord } from '@/lib/service-engagement'
import { eqValue, hasCall, type FakeQuery, type FakeResult } from './campaign-supabase-fake'

export type Row = Record<string, unknown>

export function rental(overrides: Partial<CsrCapabilityRentalRecord> = {}): CsrCapabilityRentalRecord {
  return {
    id: `c1:${overrides.service_offer_id ?? 7}`,
    campaign_id: 'c1',
    service_offer_id: 7,
    company_user_id: 3,
    provider_user_id: 40,
    lead_ngo_user_id: 12,
    offer_type: 'material',
    material_total_worth_inr: 10000,
    rental_amount_inr: 1000,
    status: 'paid',
    payment_status: 'paid',
    ...overrides,
  }
}

export function createCampaignStore() {
  const store = {
    campaigns: [] as Row[],
    users: {} as Record<number, Row>,
    offers: {} as Record<number, Row>,
  }

  function respond(query: FakeQuery): FakeResult | undefined {
    const single = hasCall(query, 'single') || hasCall(query, 'maybeSingle')
    const id = eqValue(query, 'id')
    if (query.table === 'campaigns') {
      if (query.op === 'update') {
        store.campaigns = store.campaigns.map((row) =>
          String(row.id) === String(id) ? { ...row, ...(query.payload as Row) } : row
        )
        return {}
      }
      const companyId = eqValue(query, 'company_id')
      const rows = store.campaigns.filter(
        (row) =>
          (id === undefined || String(row.id) === String(id)) &&
          (companyId === undefined || Number(row.company_id) === Number(companyId))
      )
      return single ? (rows[0] ? { data: rows[0] } : { data: null, error: { message: 'no rows' } }) : { data: rows }
    }
    if (query.table === 'users') {
      if (query.op === 'update') return {}
      const user = store.users[Number(id)]
      return user ? { data: user } : { data: null, error: { message: 'no rows' } }
    }
    if (query.table === 'service_offers') {
      if (query.op === 'update') return {}
      if (!single) return { data: Object.values(store.offers) }
      const offer = store.offers[Number(id)]
      return offer ? { data: offer } : { data: null, error: { message: 'no rows' } }
    }
    return undefined
  }

  function rentals(campaignId = 'c1') {
    return parseCsrCapabilityRentals(store.campaigns.find((row) => row.id === campaignId)?.impact_metrics)
  }

  return { store, respond, rentals }
}
