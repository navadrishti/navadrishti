import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getApplicationApplicantUserId,
  normalizeApplicationApplicantFields,
  serviceRequestApplications,
  shapeApplicationForApi,
  splitApplicationUpdatePayload,
} from '@/lib/db/applications'
import { callsOf, compact, createSupabaseFake, eqsOf, unknownColumns, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ supabase: { from: mocks.from } }))

let fake = createSupabaseFake()

function useDb(responses: Record<string, FakeResult[]> = {}) {
  fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  useDb()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  expect(unknownColumns(fake.queries)).toEqual([])
})

const WITH_FULFILLMENT = '*,fulfillment:service_request_fulfillments!application_id(*)'

describe('application helpers', () => {
  it.each([
    [{ applicant_user_id: 4 }, 4],
    [{ applicant_user_id: '9' }, 9],
    [{ volunteer_id: 4 }, 0],
    [null, 0],
  ])('reads the applicant from %j', (row, expected) => {
    expect(getApplicationApplicantUserId(row)).toBe(expected)
  })

  it.each([
    [{ volunteer_id: 4 }, { applicant_user_id: 4 }],
    [{ applicant_user_id: 5, volunteer_id: 4 }, { applicant_user_id: 5 }],
    [{ volunteer_id: 0, note: 'x' }, { note: 'x' }],
  ])('normalizes %j', (input, expected) => {
    expect(normalizeApplicationApplicantFields(input)).toEqual(expected)
  })

  it('moves fulfillment fields off the application update', () => {
    expect(
      splitApplicationUpdatePayload({ status: 'completed', volunteer_id: 3, fulfilled_amount: 50, completion_note: 'done' })
    ).toEqual({
      application: { status: 'completed' },
      fulfillment: { fulfilled_amount: 50, completion_note: 'done' },
    })
  })

  it.each([
    ['an array', [{ fulfilled_amount: 10 }]],
    ['an object', { fulfilled_amount: 10 }],
  ])('flattens a fulfillment given as %s', (_name, fulfillment) => {
    expect(shapeApplicationForApi({ id: 1, applicant_user_id: '3', application_message: 'hi', fulfillment })).toEqual({
      id: 1,
      applicant_user_id: 3,
      fulfilled_amount: 10,
      message: 'hi',
      application_message: 'hi',
    })
  })

  it('falls back to the legacy message key', () => {
    expect(shapeApplicationForApi({ id: 1, message: 'old', service_request_fulfillments: null })).toMatchObject({
      message: 'old',
      application_message: 'old',
    })
  })

  it.each([null, undefined])('passes %s through', (row) => {
    expect(shapeApplicationForApi(row)).toBe(row)
  })
})

describe('serviceRequestApplications.create', () => {
  it('splits the insert into application and fulfillment rows', async () => {
    useDb({ 'service_request_applications.insert': [{ data: { id: 8, service_request_id: 2, application_message: 'hi' } }] })

    const result = await serviceRequestApplications.create({
      service_request_id: 2,
      volunteer_id: 4,
      message: 'hi',
      volunteer_type: 'individual',
      created_at: '2026-01-01T00:00:00.000Z',
      fulfillment_amount: 500,
    } as unknown as Parameters<typeof serviceRequestApplications.create>[0])

    const [insert, upsert] = fake.queries
    expect(insert.payload).toMatchObject({
      service_request_id: 2,
      applicant_user_id: 4,
      application_message: 'hi',
      responder_type: 'individual',
      applied_at: '2026-01-01T00:00:00.000Z',
    })
    expect(insert.payload).not.toHaveProperty('fulfillment_amount')
    expect(upsert).toMatchObject({
      table: 'service_request_fulfillments',
      op: 'upsert',
      payload: { application_id: 8, service_request_id: 2, fulfillment_amount: 500, fulfilled_amount: 0 },
      options: { onConflict: 'application_id' },
    })
    expect(result).toMatchObject({ id: 8, message: 'hi' })
  })

  it('throws insert errors without creating a fulfillment', async () => {
    useDb({ 'service_request_applications.insert': [{ error: { message: 'dup' } }] })
    await expect(
      serviceRequestApplications.create({ service_request_id: 2, applicant_user_id: 4 })
    ).rejects.toEqual({ message: 'dup' })
    expect(fake.find('service_request_fulfillments')).toHaveLength(0)
  })

  it('still returns the application when the fulfillment upsert fails', async () => {
    useDb({
      'service_request_applications.insert': [{ data: { id: 8, service_request_id: 2 } }],
      'service_request_fulfillments.upsert': [{ error: { message: 'fk' } }],
    })
    await expect(
      serviceRequestApplications.create({ service_request_id: 2, applicant_user_id: 4 })
    ).resolves.toMatchObject({ id: 8 })
  })
})

describe('serviceRequestApplications reads', () => {
  it.each([
    ['findExisting', () => serviceRequestApplications.findExisting(2, 4)],
    ['getUserApplication', () => serviceRequestApplications.getUserApplication(2, 4)],
  ])('%s filters by request and applicant', async (_name, run) => {
    useDb({ 'service_request_applications.select': [{ data: { id: 1, fulfillment: [{ fulfilled_quantity: 3 }] } }] })
    await expect(run()).resolves.toMatchObject({ id: 1, fulfilled_quantity: 3 })
    expect(compact(fake.queries[0].columns)).toBe(WITH_FULFILLMENT)
    expect(eqsOf(fake.queries[0])).toEqual({ service_request_id: 2, applicant_user_id: 4 })
  })

  it('treats a missing application as null', async () => {
    useDb({ 'service_request_applications.select': [{ error: { code: 'PGRST116' } }] })
    await expect(serviceRequestApplications.findExisting(2, 4)).resolves.toBeNull()
  })

  it('lists an applicant newest first', async () => {
    useDb({ 'service_request_applications.select': [{ data: [{ id: 1 }] }] })
    await expect(serviceRequestApplications.getByVolunteerId(4)).resolves.toHaveLength(1)
    expect(eqsOf(fake.queries[0])).toEqual({ applicant_user_id: 4 })
    expect(callsOf(fake.queries[0], 'order')).toEqual([['applied_at', { ascending: false }]])
  })

  it('lists a request with the volunteer profile', async () => {
    useDb({ 'service_request_applications.select': [{ data: [] }] })
    await serviceRequestApplications.getByRequestId(2)
    const columns = compact(fake.queries[0].columns)
    expect(columns).toContain('volunteer:users!applicant_user_id(id,name,email,user_type,location,verification_status,profile_image)')
    expect(columns).not.toContain('password')
  })

  it('throws list errors', async () => {
    useDb({ 'service_request_applications.select': [{ error: { message: 'down' } }] })
    await expect(serviceRequestApplications.getByRequestId(2)).rejects.toEqual({ message: 'down' })
  })
})

describe('serviceRequestApplications.update', () => {
  it('updates only the application when no fulfillment fields change', async () => {
    useDb({ 'service_request_applications.update': [{ data: { id: 3, service_request_id: 2, status: 'accepted' } }] })
    await expect(serviceRequestApplications.updateStatus(3, 'accepted')).resolves.toMatchObject({ status: 'accepted' })
    expect(fake.queries).toHaveLength(1)
    expect(fake.queries[0].payload).toMatchObject({ status: 'accepted' })
    expect(eqsOf(fake.queries[0])).toEqual({ id: 3 })
  })

  it('upserts fulfillment fields and returns the refreshed row', async () => {
    useDb({
      'service_request_applications.update': [{ data: { id: 3, service_request_id: 2 } }],
      'service_request_applications.select': [{ data: { id: 3, fulfillment: { fulfilled_amount: 70 } } }],
    })
    await expect(
      serviceRequestApplications.update(3, { status: 'completed', fulfilled_amount: 70 })
    ).resolves.toMatchObject({ id: 3, fulfilled_amount: 70 })
    const [update, upsert, refresh] = fake.queries
    expect(update.payload).not.toHaveProperty('fulfilled_amount')
    expect(upsert).toMatchObject({
      op: 'upsert',
      payload: { application_id: 3, service_request_id: 2, fulfilled_amount: 70 },
      options: { onConflict: 'application_id' },
    })
    expect(eqsOf(refresh)).toEqual({ id: 3 })
  })

  it('throws fulfillment errors', async () => {
    useDb({
      'service_request_applications.update': [{ data: { id: 3, service_request_id: 2 } }],
      'service_request_fulfillments.upsert': [{ error: { message: 'fk' } }],
    })
    await expect(serviceRequestApplications.update(3, { completion_note: 'x' })).rejects.toEqual({ message: 'fk' })
  })
})
