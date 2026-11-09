import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as listEligible } from '@/app/api/ngo/field-officers/eligible-projects/route'
import { GET as listByProject } from '@/app/api/ngo/field-officers/assignments/route'
import {
  GET as listAssignments,
  POST as assignProjects,
} from '@/app/api/ngo/field-officers/[identityId]/assignments/route'
import { PATCH as patchAssignment } from '@/app/api/ngo/field-officers/[identityId]/assignments/[assignmentId]/route'
import { forgetSessionBlockReason } from '@/lib/server-auth'
import { isProjectEligibleForFieldAssignment } from '@/lib/ngo-field-officer'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
  db: { users: {} },
}))

const ngoAToken = jwt.sign(
  { id: 21, email: 'ngo-a@example.org', user_type: 'ngo', verification_status: 'verified' },
  'test-secret'
)
const ngoBToken = jwt.sign(
  { id: 22, email: 'ngo-b@example.org', user_type: 'ngo', verification_status: 'verified' },
  'test-secret'
)

const activeOfficer = {
  id: 'fo-1',
  user_id: 90,
  ngo_user_id: 21,
  status: 'active',
  permissions: {},
  must_change_password: false,
  created_by: 21,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_login_at: null,
  deactivated_at: null,
}

const activeProject = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Clean Water Drive',
  project_status: 'active',
  ngo_user_id: 21,
  campaign_id: 'campaign-1',
  campaigns: { lead_ngo_user_id: 21 },
}

function fakeForNgo(extra: Record<string, FakeResult[]> = {}) {
  const foSelectExtra = extra['ngo_field_officer_identities.select'] ?? []
  const { ['ngo_field_officer_identities.select']: _ignored, ...rest } = extra
  return createSupabaseFake({
    'users.select': [
      {
        data: {
          account_status: 'active',
          locked_until: null,
          profile_data: {},
          user_type: 'ngo',
          verification_status: 'verified',
        },
      },
    ],
    'company_ca_identities.select': [{ data: null }],
    'ngo_field_officer_identities.select': [{ data: null }, ...foSelectExtra],
    ...rest,
  })
}

beforeEach(() => {
  forgetSessionBlockReason(21)
  forgetSessionBlockReason(22)
  mocks.from.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('field assignment eligibility helpers', () => {
  it('allows planning/active/on-hold/in_progress and rejects history statuses', () => {
    expect(isProjectEligibleForFieldAssignment('active')).toBe(true)
    expect(isProjectEligibleForFieldAssignment('planning')).toBe(true)
    expect(isProjectEligibleForFieldAssignment('on-hold')).toBe(true)
    expect(isProjectEligibleForFieldAssignment('in_progress')).toBe(true)
    expect(isProjectEligibleForFieldAssignment('completed')).toBe(false)
    expect(isProjectEligibleForFieldAssignment('cancelled')).toBe(false)
  })
})

describe('NGO field officer project assignments', () => {
  it('does not list or assign a project when its campaign has a different lead', async () => {
    const nonLeadProject = { ...activeProject, campaigns: { lead_ngo_user_id: 22 } }
    let fake = fakeForNgo({ 'csr_projects.select': [{ data: [nonLeadProject] }] })
    mocks.from.mockImplementation(fake.from)
    const listResponse = await listEligible(
      new NextRequest('http://localhost/api/ngo/field-officers/eligible-projects', {
        headers: { authorization: `Bearer ${ngoAToken}` },
      })
    )
    expect(listResponse.status).toBe(200)
    expect((await listResponse.json()).data).toEqual([])

    fake = fakeForNgo({
      'ngo_field_officer_identities.select': [{ data: activeOfficer }],
      'csr_projects.select': [{ data: nonLeadProject }],
    })
    mocks.from.mockImplementation(fake.from)
    const response = await assignProjects(
      new NextRequest('http://localhost/api/ngo/field-officers/fo-1/assignments', {
        method: 'POST',
        headers: { authorization: `Bearer ${ngoAToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ projectIds: [activeProject.id] }),
      }),
      { params: Promise.resolve({ identityId: 'fo-1' }) }
    )
    expect(response.status).toBe(404)
    expect(fake.find('ngo_field_officer_project_assignments', 'insert')).toHaveLength(0)
  })

  it('lists only eligible owned projects', async () => {
    const fake = fakeForNgo({
      'csr_projects.select': [
        {
          data: [
            activeProject,
            { ...activeProject, id: '22222222-2222-4222-8222-222222222222', project_status: 'completed' },
          ],
        },
      ],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await listEligible(
      new NextRequest('http://localhost/api/ngo/field-officers/eligible-projects', {
        headers: { authorization: `Bearer ${ngoAToken}` },
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toEqual([
      expect.objectContaining({ id: activeProject.id, project_status: 'active' }),
    ])
  })

  it('assigns an active officer to an owned eligible project', async () => {
    const fake = fakeForNgo({
      'ngo_field_officer_identities.select': [{ data: activeOfficer }],
      'csr_projects.select': [{ data: activeProject }],
      'ngo_field_officer_project_assignments.select': [{ data: null }],
      'ngo_field_officer_project_assignments.insert': [
        {
          data: {
            id: 'asg-1',
            field_officer_identity_id: 'fo-1',
            field_officer_user_id: 90,
            ngo_user_id: 21,
            project_id: activeProject.id,
            status: 'active',
            assigned_by: 21,
            assigned_at: '2026-11-07T00:00:00Z',
            deactivated_at: null,
            created_at: '2026-11-07T00:00:00Z',
            updated_at: '2026-11-07T00:00:00Z',
          },
        },
      ],
      'csr_audit_log.insert': [{ data: { id: 'audit-1' } }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await assignProjects(
      new NextRequest('http://localhost/api/ngo/field-officers/fo-1/assignments', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ngoAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ projectIds: [activeProject.id] }),
      }),
      { params: Promise.resolve({ identityId: 'fo-1' }) }
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.assigned).toBe(1)
    expect(fake.writes('ngo_field_officer_project_assignments', 'insert')[0].payload).toMatchObject({
      field_officer_identity_id: 'fo-1',
      ngo_user_id: 21,
      project_id: activeProject.id,
      status: 'active',
    })
    expect(fake.writes('csr_audit_log', 'insert')[0].payload).toMatchObject({
      event_type: 'ngo_field_officer_project_assigned',
      created_by: 21,
    })
  })

  it('rejects inactive officers', async () => {
    const inactiveFake = fakeForNgo({
      'ngo_field_officer_identities.select': [{ data: { ...activeOfficer, status: 'inactive' } }],
    })
    mocks.from.mockImplementation(inactiveFake.from)
    const inactiveResponse = await assignProjects(
      new NextRequest('http://localhost/api/ngo/field-officers/fo-1/assignments', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ngoAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ projectIds: [activeProject.id] }),
      }),
      { params: Promise.resolve({ identityId: 'fo-1' }) }
    )
    expect(inactiveResponse.status).toBe(409)
  })

  it('rejects completed projects', async () => {
    const completedFake = fakeForNgo({
      'ngo_field_officer_identities.select': [{ data: activeOfficer }],
      'csr_projects.select': [{ data: { ...activeProject, project_status: 'completed' } }],
    })
    mocks.from.mockImplementation(completedFake.from)
    const completedResponse = await assignProjects(
      new NextRequest('http://localhost/api/ngo/field-officers/fo-1/assignments', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ngoAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ projectIds: [activeProject.id] }),
      }),
      { params: Promise.resolve({ identityId: 'fo-1' }) }
    )
    expect(completedResponse.status).toBe(409)
  })

  it('prevents duplicate active assignments', async () => {
    const existing = {
      id: 'asg-1',
      field_officer_identity_id: 'fo-1',
      field_officer_user_id: 90,
      ngo_user_id: 21,
      project_id: activeProject.id,
      status: 'active',
      assigned_by: 21,
      assigned_at: '2026-11-01T00:00:00Z',
      deactivated_at: null,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    }

    const duplicateFake = fakeForNgo({
      'ngo_field_officer_identities.select': [{ data: activeOfficer }],
      'csr_projects.select': [{ data: activeProject }],
      'ngo_field_officer_project_assignments.select': [{ data: existing }],
    })
    mocks.from.mockImplementation(duplicateFake.from)
    const duplicate = await assignProjects(
      new NextRequest('http://localhost/api/ngo/field-officers/fo-1/assignments', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ngoAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ projectIds: [activeProject.id] }),
      }),
      { params: Promise.resolve({ identityId: 'fo-1' }) }
    )
    expect(duplicate.status).toBe(409)
  })

  it('deactivates and reactivates assignments while preserving the row', async () => {
    const existing = {
      id: 'asg-1',
      field_officer_identity_id: 'fo-1',
      field_officer_user_id: 90,
      ngo_user_id: 21,
      project_id: activeProject.id,
      status: 'active',
      assigned_by: 21,
      assigned_at: '2026-11-01T00:00:00Z',
      deactivated_at: null,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    }

    const deactivateFake = fakeForNgo({
      'ngo_field_officer_identities.select': [{ data: activeOfficer }],
      'ngo_field_officer_project_assignments.select': [{ data: existing }],
      'csr_projects.select': [{ data: { ...activeProject, start_date: null } }],
      'ngo_field_officer_project_assignments.update': [
        { data: { ...existing, status: 'inactive', deactivated_at: '2026-11-07T00:00:00Z' } },
      ],
      'csr_audit_log.insert': [{ data: { id: 'audit-2' } }],
    })
    mocks.from.mockImplementation(deactivateFake.from)
    const deactivated = await patchAssignment(
      new NextRequest('http://localhost/api/ngo/field-officers/fo-1/assignments/asg-1', {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${ngoAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'inactive' }),
      }),
      { params: Promise.resolve({ identityId: 'fo-1', assignmentId: 'asg-1' }) }
    )
    expect(deactivated.status).toBe(200)
    expect(deactivateFake.writes('ngo_field_officer_project_assignments', 'update')[0].payload).toMatchObject({
      status: 'inactive',
    })
    expect(
      (deactivateFake.writes('csr_audit_log', 'insert')[0].payload as { event_type: string })
        .event_type
    ).toBe('ngo_field_officer_project_assignment_deactivated')

    forgetSessionBlockReason(21)
    const reactivateFake = fakeForNgo({
      'ngo_field_officer_identities.select': [{ data: activeOfficer }],
      'ngo_field_officer_project_assignments.select': [
        { data: { ...existing, status: 'inactive', deactivated_at: '2026-11-07T00:00:00Z' } },
      ],
      'csr_projects.select': [{ data: activeProject }],
      'ngo_field_officer_project_assignments.update': [
        { data: { ...existing, status: 'active', deactivated_at: null } },
      ],
      'csr_audit_log.insert': [{ data: { id: 'audit-3' } }],
    })
    mocks.from.mockImplementation(reactivateFake.from)
    const reactivated = await patchAssignment(
      new NextRequest('http://localhost/api/ngo/field-officers/fo-1/assignments/asg-1', {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${ngoAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'active' }),
      }),
      { params: Promise.resolve({ identityId: 'fo-1', assignmentId: 'asg-1' }) }
    )
    expect(reactivated.status).toBe(200)
    expect(
      (reactivateFake.writes('csr_audit_log', 'insert')[0].payload as { event_type: string })
        .event_type
    ).toBe('ngo_field_officer_project_assignment_reactivated')
  })

  it('denies cross-NGO assignment inspection and creation', async () => {
    const listFake = fakeForNgo({
      'ngo_field_officer_identities.select': [{ data: null }],
    })
    mocks.from.mockImplementation(listFake.from)
    const listResponse = await listAssignments(
      new NextRequest('http://localhost/api/ngo/field-officers/fo-1/assignments', {
        headers: { authorization: `Bearer ${ngoBToken}` },
      }),
      { params: Promise.resolve({ identityId: 'fo-1' }) }
    )
    expect(listResponse.status).toBe(404)

    const assignFake = fakeForNgo({
      'ngo_field_officer_identities.select': [{ data: null }],
    })
    mocks.from.mockImplementation(assignFake.from)
    const assignResponse = await assignProjects(
      new NextRequest('http://localhost/api/ngo/field-officers/fo-1/assignments', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ngoBToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ projectIds: [activeProject.id] }),
      }),
      { params: Promise.resolve({ identityId: 'fo-1' }) }
    )
    expect(assignResponse.status).toBe(404)
    expect(assignFake.writes('ngo_field_officer_project_assignments', 'insert')).toHaveLength(0)

    const projectFake = fakeForNgo({
      'csr_projects.select': [{ data: null }],
    })
    mocks.from.mockImplementation(projectFake.from)
    const roster = await listByProject(
      new NextRequest(
        `http://localhost/api/ngo/field-officers/assignments?projectId=${activeProject.id}`,
        { headers: { authorization: `Bearer ${ngoBToken}` } }
      )
    )
    expect(roster.status).toBe(404)
  })
})
