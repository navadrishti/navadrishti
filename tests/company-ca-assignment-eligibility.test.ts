import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  identity: null as null | Record<string, unknown>,
  project: null as null | Record<string, unknown>,
  assignment: null as null | Record<string, unknown>,
  writes: [] as Array<{ table: string; operation: string }>,
  from: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({
  AuthError: class AuthError extends Error {},
  hashPassword: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ supabase: { from: state.from } }))

import {
  assignCompanyCaToProject,
  CompanyCaAssignmentError,
  setCompanyCaAssignmentStatus,
} from '@/lib/company-ca'

const IDENTITY_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const PROJECT_ID = '11111111-2222-4333-8444-555555555555'

function installDatabaseFake() {
  state.from.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {}
    let operation = 'select'
    let payload: Record<string, unknown> = {}
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value
        return query
      },
      maybeSingle: async () => {
        if (table === 'company_ca_identities') {
          const identity = state.identity
          return {
            data:
              identity &&
              Object.entries(filters).every(([key, value]) => identity[key] === value)
                ? identity
                : null,
            error: null,
          }
        }
        if (table === 'csr_projects') {
          const project = state.project
          return {
            data:
              project &&
              Object.entries(filters).every(([key, value]) => project[key] === value)
                ? project
                : null,
            error: null,
          }
        }
        if (table === 'company_ca_project_assignments') {
          const assignment = state.assignment
          return {
            data:
              assignment &&
              Object.entries(filters).every(([key, value]) => assignment[key] === value)
                ? assignment
                : null,
            error: null,
          }
        }
        return { data: null, error: null }
      },
      insert: (value: Record<string, unknown>) => {
        operation = 'insert'
        payload = value
        return query
      },
      update: (value: Record<string, unknown>) => {
        operation = 'update'
        payload = value
        return query
      },
      single: async () => {
        state.writes.push({ table, operation })
        if (operation === 'insert') {
          state.assignment = {
            id: 'assignment-1',
            ...payload,
            assigned_at: '2026-11-08T00:00:00.000Z',
            created_at: '2026-11-08T00:00:00.000Z',
            updated_at: '2026-11-08T00:00:00.000Z',
          }
        } else if (operation === 'update' && state.assignment) {
          state.assignment = { ...state.assignment, ...payload }
        }
        return { data: state.assignment, error: null }
      },
    }
    return query
  })
}

function resetDatabase(input: {
  status?: string
  companyUserId?: number
  permissions?: unknown
  assignmentStatus?: string
} = {}) {
  state.identity = {
    id: IDENTITY_ID,
    user_id: 22,
    company_user_id: input.companyUserId ?? 10,
    status: input.status ?? 'active',
    permissions:
      input.permissions === undefined
        ? { can_review_evidence: true }
        : input.permissions,
  }
  state.project = {
    id: PROJECT_ID,
    title: 'Water project',
    project_status: 'active',
    company_user_id: 10,
  }
  state.assignment = input.assignmentStatus
    ? {
        id: 'assignment-1',
        company_ca_identity_id: IDENTITY_ID,
        company_ca_user_id: 22,
        company_user_id: 10,
        project_id: PROJECT_ID,
        status: input.assignmentStatus,
      }
    : null
  state.writes = []
}

const assignmentInput = {
  companyUserId: 10,
  actorUserId: 10,
  identityId: IDENTITY_ID,
  projectId: PROJECT_ID,
}

describe('Evidence Verifier assignment eligibility', () => {
  beforeEach(() => {
    resetDatabase()
    installDatabaseFake()
  })

  it('rejects inactive identities before inserting an assignment', async () => {
    resetDatabase({ status: 'inactive' })
    await expect(assignCompanyCaToProject(assignmentInput)).rejects.toMatchObject({
      name: 'CompanyCaAssignmentError',
      status: 409,
    })
    expect(state.writes).toHaveLength(0)
  })

  it('rejects identities belonging to another company', async () => {
    resetDatabase({ companyUserId: 40 })
    await expect(assignCompanyCaToProject(assignmentInput)).rejects.toMatchObject({
      name: 'CompanyCaAssignmentError',
      status: 404,
    })
    expect(state.writes).toHaveLength(0)
  })

  it.each([
    ['missing', {}],
    ['false', { can_review_evidence: false }],
    ['null', { can_review_evidence: null }],
    ['string', { can_review_evidence: 'true' }],
    ['number', { can_review_evidence: 1 }],
    ['array', ['can_review_evidence', true]],
    ['null permissions', null],
  ])('rejects %s evidence-review permission before inserting', async (_label, permissions) => {
    resetDatabase({ permissions })
    await expect(assignCompanyCaToProject(assignmentInput)).rejects.toBeInstanceOf(
      CompanyCaAssignmentError
    )
    expect(state.writes).toHaveLength(0)
  })

  it('creates an assignment for an active, same-company identity with boolean permission', async () => {
    const result = await assignCompanyCaToProject(assignmentInput)
    expect(result).toMatchObject({
      created: true,
      assignment: {
        company_ca_identity_id: IDENTITY_ID,
        company_ca_user_id: 22,
        company_user_id: 10,
        project_id: PROJECT_ID,
        status: 'active',
      },
    })
    expect(state.writes).toEqual([{ table: 'company_ca_project_assignments', operation: 'insert' }])
  })

  it.each([
    ['inactive identity', { status: 'inactive' }],
    ['malformed permission', { permissions: { can_review_evidence: 'true' } }],
  ])('does not reactivate an assignment for an %s', async (_label, eligibility) => {
    resetDatabase({ ...eligibility, assignmentStatus: 'inactive' })
    await expect(
      setCompanyCaAssignmentStatus({
        companyUserId: 10,
        actorUserId: 10,
        identityId: IDENTITY_ID,
        assignmentId: 'assignment-1',
        status: 'active',
      })
    ).rejects.toMatchObject({ name: 'CompanyCaAssignmentError', status: 409 })
    expect(state.writes).toHaveLength(0)
    expect(state.assignment?.status).toBe('inactive')
  })

  it('reactivates an eligible inactive assignment', async () => {
    resetDatabase({ assignmentStatus: 'inactive' })
    const assignment = await setCompanyCaAssignmentStatus({
      companyUserId: 10,
      actorUserId: 10,
      identityId: IDENTITY_ID,
      assignmentId: 'assignment-1',
      status: 'active',
    })
    expect(assignment).toMatchObject({
      company_ca_identity_id: IDENTITY_ID,
      company_user_id: 10,
      project_id: PROJECT_ID,
      status: 'active',
    })
    expect(state.writes).toEqual([{ table: 'company_ca_project_assignments', operation: 'update' }])
  })
})
