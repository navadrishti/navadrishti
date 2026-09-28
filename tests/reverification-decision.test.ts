import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReverificationConflictError, rejectReverification } from '@/lib/reverification'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from }, db: {} }))

const pendingNgo = {
  id: 9,
  name: 'Seva',
  user_type: 'ngo',
  verification_status: 'verified',
  profile_data: {
    reverification_pending: true,
    verification_documents: { ngo: { reverification_documents: { ngoPanCard: 'new.pdf' } } },
  },
}

function useDb(update: FakeResult) {
  const fake = createSupabaseFake({ 'users.select': [{ data: pendingNgo }], 'users.update': [update] })
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  mocks.from.mockReset()
})

describe('reverification decisions', () => {
  it('saves only while the reverification is still pending', async () => {
    const fake = useDb({ data: { id: 9, verification_status: 'verified' } })
    await expect(rejectReverification(9, 'Old 80G', 'CA Three')).resolves.toMatchObject({ id: 9 })
    expect(fake.writes('users')[0].filters).toEqual([
      ['eq', 'id', 9],
      ['eq', 'verification_status', 'verified'],
      ['contains', 'profile_data', { reverification_pending: true }],
      ['select', 'id, name, email, user_type, verification_status, profile_data, updated_at'],
    ])
  })

  it('throws a conflict when another reviewer decided first', async () => {
    useDb({ data: null })
    await expect(rejectReverification(9, 'Old 80G', 'CA Three')).rejects.toBeInstanceOf(ReverificationConflictError)
  })
})
