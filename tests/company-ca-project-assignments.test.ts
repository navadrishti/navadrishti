import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  assertVerifiedCompanyEvidenceVerifierManager,
  assignCompanyCaToProject,
  setCompanyCaAssignmentStatus,
  findCompanyCaIdentityForCompany,
} = vi.hoisted(() => ({
  assertVerifiedCompanyEvidenceVerifierManager: vi.fn(async () => undefined),
  assignCompanyCaToProject: vi.fn(),
  setCompanyCaAssignmentStatus: vi.fn(),
  findCompanyCaIdentityForCompany: vi.fn(),
}))

vi.mock('@/lib/server-auth', () => ({
  getAuthUserFromRequest: vi.fn(),
  authErrorResponse: vi.fn(() => null),
}))

vi.mock('@/lib/company-ca', () => ({
  assertVerifiedCompanyEvidenceVerifierManager,
  assignCompanyCaToProject,
  setCompanyCaAssignmentStatus,
  findCompanyCaIdentityForCompany,
  isProjectEligibleForCompanyCaAssignment: (status: unknown) => {
    const normalized = String(status || '')
      .trim()
      .toLowerCase()
    if (!normalized) return false
    if (['completed', 'closed', 'cancelled', 'canceled', 'expired'].includes(normalized)) return false
    return ['planning', 'active', 'on-hold', 'in_progress', 'submitted'].includes(normalized)
  },
  CompanyCaAssignmentError: class CompanyCaAssignmentError extends Error {
    status: number
    constructor(message: string, status = 400) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock('@/lib/db', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { getAuthUserFromRequest } from '@/lib/server-auth'
import { isProjectEligibleForCompanyCaAssignment } from '@/lib/company-ca'
import {
  POST as assignProjects,
  GET as listAssignments,
} from '@/app/api/evidence-verification/accounts/[identityId]/assignments/route'
import { PATCH as patchAssignment } from '@/app/api/evidence-verification/accounts/[identityId]/assignments/[assignmentId]/route'

describe('company Evidence Verifier project assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAuthUserFromRequest).mockResolvedValue({
      id: 10,
      user_type: 'company',
      verification_status: 'verified',
      email: 'owner@test.com',
      name: 'Owner',
    } as never)
  })

  it('treats planning/active projects as assignable and completed as not', () => {
    expect(isProjectEligibleForCompanyCaAssignment('active')).toBe(true)
    expect(isProjectEligibleForCompanyCaAssignment('planning')).toBe(true)
    expect(isProjectEligibleForCompanyCaAssignment('completed')).toBe(false)
  })

  it('assigns a project through the owner API', async () => {
    assignCompanyCaToProject.mockResolvedValue({
      assignment: {
        id: 'asg-1',
        company_ca_identity_id: 'ev-1',
        company_ca_user_id: 22,
        company_user_id: 10,
        project_id: '11111111-1111-4111-8111-111111111102',
        status: 'active',
        assigned_by: 10,
        assigned_at: new Date().toISOString(),
        deactivated_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      created: true,
    })

    const response = await assignProjects(
      new NextRequest('http://localhost/api/evidence-verification/accounts/ev-1/assignments', {
        method: 'POST',
        body: JSON.stringify({ projectIds: ['11111111-1111-4111-8111-111111111102'] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ identityId: 'ev-1' }) }
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(assignCompanyCaToProject).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUserId: 10,
        identityId: 'ev-1',
        projectId: '11111111-1111-4111-8111-111111111102',
      })
    )
  })

  it('lists assignments for a company-scoped Evidence Verifier', async () => {
    findCompanyCaIdentityForCompany.mockResolvedValue({
      id: 'ev-1',
      user_id: 22,
      company_user_id: 10,
      status: 'active',
      permissions: { can_review_evidence: true },
    })

    const { supabase } = await import('@/lib/db')
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq2 = vi.fn(() => ({ order }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    const select = vi.fn(() => ({ eq: eq1 }))
    vi.mocked(supabase.from).mockReturnValue({ select } as never)

    const response = await listAssignments(
      new NextRequest('http://localhost/api/evidence-verification/accounts/ev-1/assignments'),
      { params: Promise.resolve({ identityId: 'ev-1' }) }
    )
    expect(response.status).toBe(200)
    expect(supabase.from).toHaveBeenCalledWith('company_ca_project_assignments')
  })

  it('deactivates an assignment', async () => {
    setCompanyCaAssignmentStatus.mockResolvedValue({
      id: 'asg-1',
      company_ca_identity_id: 'ev-1',
      company_ca_user_id: 22,
      company_user_id: 10,
      project_id: '11111111-1111-4111-8111-111111111102',
      status: 'inactive',
      assigned_by: 10,
      assigned_at: new Date().toISOString(),
      deactivated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const response = await patchAssignment(
      new NextRequest(
        'http://localhost/api/evidence-verification/accounts/ev-1/assignments/asg-1',
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'inactive' }),
          headers: { 'Content-Type': 'application/json' },
        }
      ),
      { params: Promise.resolve({ identityId: 'ev-1', assignmentId: 'asg-1' }) }
    )
    expect(response.status).toBe(200)
    expect(setCompanyCaAssignmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'inactive', assignmentId: 'asg-1' })
    )
  })

  it('restores an inactive assignment to active', async () => {
    setCompanyCaAssignmentStatus.mockResolvedValue({
      id: 'asg-1',
      company_ca_identity_id: 'ev-1',
      company_ca_user_id: 22,
      company_user_id: 10,
      project_id: '11111111-1111-4111-8111-111111111102',
      status: 'active',
      assigned_by: 10,
      assigned_at: new Date().toISOString(),
      deactivated_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const response = await patchAssignment(
      new NextRequest(
        'http://localhost/api/evidence-verification/accounts/ev-1/assignments/asg-1',
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'active' }),
          headers: { 'Content-Type': 'application/json' },
        }
      ),
      { params: Promise.resolve({ identityId: 'ev-1', assignmentId: 'asg-1' }) }
    )
    expect(response.status).toBe(200)
    expect(setCompanyCaAssignmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', assignmentId: 'asg-1', identityId: 'ev-1' })
    )
  })
})
