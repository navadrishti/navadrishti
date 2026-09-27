import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { userAddresses, users } from '@/lib/db/users'
import { callsOf, compact, createDbFake, eqsOf, unknownColumns, type DbResult } from './db-supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ supabase: { from: mocks.from } }))

let fake = createDbFake()

function useDb(responses: Record<string, DbResult[]> = {}) {
  fake = createDbFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  useDb()
})

afterEach(() => {
  expect(unknownColumns(fake.queries)).toEqual([])
})

describe('users.findByEmail', () => {
  it.each([
    ['  Ada@Example.org ', 'ada@example.org'],
    ['a_b@example.org', 'a\\_b@example.org'],
    ['100%@example.org', '100\\%@example.org'],
    ['back\\slash@example.org', 'back\\\\slash@example.org'],
    ['_%\\@x.org', '\\_\\%\\\\@x.org'],
  ])('matches %j with ilike %j', async (input, pattern) => {
    useDb({ 'users.select': [{ data: [] }] })
    await users.findByEmail(input)
    const [query] = fake.queries
    expect(query.table).toBe('users')
    expect(callsOf(query, 'ilike')).toEqual([['email', pattern]])
    expect(callsOf(query, 'order')).toEqual([['id', { ascending: true }]])
    expect(callsOf(query, 'limit')).toEqual([[10]])
  })

  it.each(['', '   '])('returns null without querying for %j', async (input) => {
    await expect(users.findByEmail(input)).resolves.toBeNull()
    expect(fake.queries).toHaveLength(0)
  })

  it('prefers the exact lowercase match', async () => {
    useDb({ 'users.select': [{ data: [{ id: 1, email: 'Ada@example.org' }, { id: 2, email: 'ada@example.org' }] }] })
    await expect(users.findByEmail('ADA@example.org')).resolves.toMatchObject({ id: 2 })
  })

  it('falls back to a case-insensitive match', async () => {
    useDb({ 'users.select': [{ data: [{ id: 1, email: 'Ada@Example.org' }] }] })
    await expect(users.findByEmail('ada@example.org')).resolves.toMatchObject({ id: 1 })
  })

  it('ignores rows that only matched a wildcard', async () => {
    useDb({ 'users.select': [{ data: [{ id: 7, email: 'abc@example.org' }] }] })
    await expect(users.findByEmail('a*@example.org')).resolves.toBeNull()
  })

  it('returns null when nothing matches', async () => {
    useDb({ 'users.select': [{ data: null }] })
    await expect(users.findByEmail('x@example.org')).resolves.toBeNull()
  })

  it('throws query errors', async () => {
    const error = { message: 'down' }
    useDb({ 'users.select': [{ error }] })
    await expect(users.findByEmail('x@example.org')).rejects.toBe(error)
  })
})

describe('users crud', () => {
  it('creates and returns the inserted row', async () => {
    useDb({ 'users.insert': [{ data: { id: 3 } }] })
    const input = { email: 'a@example.org', password: 'hash', name: 'A', user_type: 'individual' as const }
    await expect(users.create(input)).resolves.toEqual({ id: 3 })
    expect(fake.queries[0]).toMatchObject({ table: 'users', op: 'insert', payload: input })
  })

  it('updates by id', async () => {
    useDb({ 'users.update': [{ data: { id: 3, name: 'B' } }] })
    await expect(users.update(3, { name: 'B' })).resolves.toEqual({ id: 3, name: 'B' })
    expect(fake.queries[0]).toMatchObject({ op: 'update', payload: { name: 'B' } })
    expect(eqsOf(fake.queries[0])).toEqual({ id: 3 })
  })

  it.each([
    ['create', () => users.create({ email: 'a@example.org', password: 'x', name: 'A', user_type: 'ngo' }), 'users.insert'],
    ['update', () => users.update(3, { name: 'B' }), 'users.update'],
  ])('%s throws errors', async (_name, run, key) => {
    const error = { message: 'boom' }
    useDb({ [key]: [{ error }] })
    await expect(run()).rejects.toBe(error)
  })

  it('finds by id', async () => {
    useDb({ 'users.select': [{ data: { id: 4 } }] })
    await expect(users.findById(4)).resolves.toEqual({ id: 4 })
    expect(eqsOf(fake.queries[0])).toEqual({ id: 4 })
  })

  it.each([
    ['findById', () => users.findById(4), 'users.select'],
    ['create', () => users.create({ email: 'a@example.org', password: 'x', name: 'A', user_type: 'ngo' }), 'users.insert'],
    ['update', () => users.update(4, { name: 'B' }), 'users.update'],
  ])('%s never reads back the password hash or 2FA secret', async (_name, run, key) => {
    useDb({ [key]: [{ data: { id: 4 } }] })
    await run()
    const columns = compact(fake.queries[0].columns ?? fake.queries[0].returning).split(',')
    expect(columns).not.toContain('*')
    expect(columns).not.toContain('password')
    expect(columns).not.toContain('two_factor_secret')
    expect(columns).toEqual(expect.arrayContaining(['id', 'email', 'account_status', 'locked_until', 'profile_data']))
  })

  it('reads the password hash only through findByIdWithPassword', async () => {
    useDb({ 'users.select': [{ data: { id: 4, email: 'a@example.org', password: 'hash' } }] })
    await expect(users.findByIdWithPassword(4)).resolves.toEqual({ id: 4, email: 'a@example.org', password: 'hash' })
    expect(compact(fake.queries[0].columns)).toBe('id,email,password')
    expect(eqsOf(fake.queries[0])).toEqual({ id: 4 })
  })

  it('findByIdWithPassword treats a missing row as null', async () => {
    useDb({ 'users.select': [{ error: { code: 'PGRST116' } }] })
    await expect(users.findByIdWithPassword(4)).resolves.toBeNull()
  })

  it('findByIdWithPassword throws other errors', async () => {
    useDb({ 'users.select': [{ error: { code: '500' } }] })
    await expect(users.findByIdWithPassword(4)).rejects.toEqual({ code: '500' })
  })

  it('treats a missing row as null', async () => {
    useDb({ 'users.select': [{ error: { code: 'PGRST116' } }] })
    await expect(users.findById(4)).resolves.toBeNull()
  })

  it('throws other lookup errors', async () => {
    useDb({ 'users.select': [{ error: { code: '500' } }] })
    await expect(users.findById(4)).rejects.toEqual({ code: '500' })
  })
})

describe('userAddresses', () => {
  const address = {
    user_id: 5,
    name: 'Home',
    address_line_1: '1 Road',
    city: 'Pune',
    state: 'MH',
    pincode: '411001',
    phone: '9999999999',
  }

  it('lists default addresses first', async () => {
    useDb({ 'user_addresses.select': [{ data: [{ id: 1 }] }] })
    await expect(userAddresses.getByUserId(5)).resolves.toEqual([{ id: 1 }])
    expect(eqsOf(fake.queries[0])).toEqual({ user_id: 5 })
    expect(callsOf(fake.queries[0], 'order')).toEqual([
      ['is_default', { ascending: false }],
      ['created_at', { ascending: false }],
    ])
  })

  it('clears other defaults before inserting a default address', async () => {
    useDb({ 'user_addresses.insert': [{ data: { id: 9 } }] })
    await expect(userAddresses.create({ ...address, is_default: true })).resolves.toEqual({ id: 9 })
    const [clear, insert] = fake.queries
    expect(clear).toMatchObject({ op: 'update', payload: { is_default: false } })
    expect(eqsOf(clear)).toEqual({ user_id: 5 })
    expect(insert.op).toBe('insert')
  })

  it('does not touch other addresses for a non-default insert', async () => {
    useDb({ 'user_addresses.insert': [{ data: { id: 9 } }] })
    await userAddresses.create(address)
    expect(fake.queries.map((query) => query.op)).toEqual(['insert'])
  })

  it('clears the other defaults of the same user when promoting an address', async () => {
    useDb({
      'user_addresses.select': [{ data: { id: 2, user_id: 5 } }],
      'user_addresses.update': [{}, { data: { id: 2, is_default: true } }],
    })
    await expect(userAddresses.update(2, { is_default: true })).resolves.toEqual({ id: 2, is_default: true })
    const [, clear, update] = fake.queries
    expect(clear.payload).toEqual({ is_default: false })
    expect(eqsOf(clear)).toEqual({ user_id: 5 })
    expect(callsOf(clear, 'neq')).toEqual([['id', 2]])
    expect(eqsOf(update)).toEqual({ id: 2 })
  })

  it('deletes by id', async () => {
    await expect(userAddresses.delete(2)).resolves.toBe(true)
    expect(fake.queries[0]).toMatchObject({ op: 'delete' })
    expect(eqsOf(fake.queries[0])).toEqual({ id: 2 })
  })

  it('throws delete errors', async () => {
    useDb({ 'user_addresses.delete': [{ error: { message: 'fk' } }] })
    await expect(userAddresses.delete(2)).rejects.toEqual({ message: 'fk' })
  })
})
