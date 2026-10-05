import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseFake } from './support/supabase-fake'
import { listCompanyPayableAssignmentIds } from '@/lib/company-ca-payable'

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client, db: {} }
})

const COMPANY = 5

beforeEach(() => {
  supabaseFake.reset()
})

describe('listCompanyPayableAssignmentIds', () => {
  it('keeps engagements the company pays and drops those it is paid for', async () => {
    supabaseFake.respondWith(() => ({
      data: [
        { id: 'volunteer', target_type: 'campaign', application_table: 'campaigns', owner_user_id: COMPANY, assignee_user_id: 21, meta: {} },
        { id: 'hired', target_type: 'service_offer', application_table: 'service_clients', owner_user_id: 30, assignee_user_id: COMPANY, meta: {} },
        { id: 'provided', target_type: 'service_offer', application_table: 'service_clients', owner_user_id: COMPANY, assignee_user_id: 40, meta: {} },
        { id: 'csr-rental', target_type: 'service_offer', application_table: 'service_clients', owner_user_id: 30, assignee_user_id: COMPANY, meta: { flow: 'csr_capability_rental' } },
      ],
    }))

    await expect(listCompanyPayableAssignmentIds(COMPANY)).resolves.toEqual(['volunteer', 'hired'])
    expect(supabaseFake.queries[0].calls).toContainEqual(['or', `owner_user_id.eq.${COMPANY},assignee_user_id.eq.${COMPANY}`])
  })

  it('surfaces lookup errors', async () => {
    const failure = { message: 'boom' }
    supabaseFake.respondWith(() => ({ error: failure }))
    await expect(listCompanyPayableAssignmentIds(COMPANY)).rejects.toBe(failure)
  })
})
