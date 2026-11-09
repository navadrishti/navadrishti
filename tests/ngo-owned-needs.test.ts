import { describe, expect, it } from 'vitest'
import {
  isStandaloneNgoOwnedNeed,
  listFullyAllocatedOwnedNeedIds,
  partitionNgoOwnedNeeds,
  shapeNgoOwnedNeedWithAssignments,
  shouldMarkOwnedNeedCompleted,
} from '@/lib/service-request-assignments/ngo-owned-needs'

const ownedOpen = {
  id: 10,
  status: 'active',
  request_type: 'Skill / Service Need',
  target_quantity: 5,
  remaining_quantity: 5,
}

const ownedPartial = {
  id: 11,
  status: 'active',
  request_type: 'Skill / Service Need',
  target_quantity: 5,
  remaining_quantity: 4,
}

const ownedFulfilled = {
  id: 12,
  status: 'active',
  request_type: 'Skill / Service Need',
  target_quantity: 1,
  remaining_quantity: 0,
}

const ownedCancelled = {
  id: 13,
  status: 'cancelled',
  request_type: 'Material Need',
  target_quantity: 10,
  remaining_quantity: 10,
}

const companyHandoff = {
  id: 99,
  status: 'active',
  request_type: 'Skill / Service Need',
  target_quantity: 3,
  remaining_quantity: 3,
  project_context: {
    csr_assignment: { mode: 'company_project_handoff', assigned_company_id: 7 },
  },
}

describe('isStandaloneNgoOwnedNeed', () => {
  it('keeps NGO-owned standalone needs', () => {
    expect(isStandaloneNgoOwnedNeed(ownedOpen)).toBe(true)
  })

  it('excludes company CSR handoffs from My Needs', () => {
    expect(isStandaloneNgoOwnedNeed(companyHandoff)).toBe(false)
  })
})

describe('shapeNgoOwnedNeedWithAssignments', () => {
  it('attaches only matching applications and counts statuses', () => {
    const shaped = shapeNgoOwnedNeedWithAssignments(ownedOpen, [
      { id: 1, service_request_id: 10, status: 'pending' },
      { id: 2, service_request_id: 10, status: 'accepted' },
      { id: 3, service_request_id: 11, status: 'accepted' },
      { id: 4, service_request_id: 10, status: 'completed', ngo_confirmed_at: '2026-11-01' },
    ])

    expect(shaped.assignments.map((row) => row.id)).toEqual([1, 2, 4])
    expect(shaped.accepted_count).toBe(2)
    expect(shaped.pending_count).toBe(1)
    expect(shaped.completed_count).toBe(1)
  })

  it('keeps owned needs with zero applications', () => {
    const shaped = shapeNgoOwnedNeedWithAssignments(ownedOpen, [])
    expect(shaped.assignments).toEqual([])
    expect(shaped.accepted_count).toBe(0)
    expect(shaped.pending_count).toBe(0)
  })
})

describe('partitionNgoOwnedNeeds', () => {
  it('puts open and partially assigned owned needs in ongoing', () => {
    const open = shapeNgoOwnedNeedWithAssignments(ownedOpen, [])
    const partial = shapeNgoOwnedNeedWithAssignments(ownedPartial, [
      { id: 1, service_request_id: 11, status: 'accepted' },
    ])
    const { ongoing, history } = partitionNgoOwnedNeeds([open, partial])
    expect(ongoing.map((row) => row.id)).toEqual([10, 11])
    expect(history).toEqual([])
  })

  it('puts fulfilled and cancelled owned needs in history without duplicating', () => {
    const fulfilled = shapeNgoOwnedNeedWithAssignments(ownedFulfilled, [
      { id: 1, service_request_id: 12, status: 'completed' },
    ])
    const cancelled = shapeNgoOwnedNeedWithAssignments(ownedCancelled, [])
    const { ongoing, history } = partitionNgoOwnedNeeds([fulfilled, cancelled])
    expect(ongoing).toEqual([])
    expect(history.map((row) => row.id).sort()).toEqual([12, 13])
  })

  it('does not treat pending applications as fulfilment', () => {
    const stillOpen = shapeNgoOwnedNeedWithAssignments(
      { ...ownedOpen, remaining_quantity: 5 },
      [{ id: 1, service_request_id: 10, status: 'pending' }]
    )
    const { ongoing, history } = partitionNgoOwnedNeeds([stillOpen])
    expect(ongoing.map((row) => row.id)).toEqual([10])
    expect(history).toEqual([])
  })
})

describe('owned need completion helpers', () => {
  it('lists fully allocated ids for leftover pending rejection', () => {
    expect(
      [...listFullyAllocatedOwnedNeedIds([ownedOpen, ownedFulfilled, ownedCancelled])].sort()
    ).toEqual([12])
  })

  it('marks skill/service needs complete once remaining capacity is zero', () => {
    expect(
      shouldMarkOwnedNeedCompleted(
        shapeNgoOwnedNeedWithAssignments(ownedFulfilled, [
          { id: 1, service_request_id: 12, status: 'accepted' },
        ])
      )
    ).toBe(true)
    expect(
      shouldMarkOwnedNeedCompleted(shapeNgoOwnedNeedWithAssignments(ownedPartial, []))
    ).toBe(false)
  })
})
