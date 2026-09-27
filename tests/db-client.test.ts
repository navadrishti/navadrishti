import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.supabase.co'
  process.env.SUPABASE_SECRET_KEY = 'secret-key'
  return { createClient: vi.fn(() => ({ from: vi.fn() })) }
})

vi.mock('server-only', () => ({}))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

describe('db client', () => {
  it('builds one stateless service client', async () => {
    const { supabase, createServerClient } = await import('@/lib/db/client')
    expect(mocks.createClient).toHaveBeenCalledTimes(1)
    expect(mocks.createClient).toHaveBeenCalledWith('https://db.example.supabase.co', 'secret-key', {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    expect(createServerClient()).toBe(supabase)
  })
})
