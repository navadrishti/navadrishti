import { describe, expect, it } from 'vitest'
import {
  keepOwnApplication,
  mergeOwnApplication,
  readReturnedApplication,
} from '@/app/service-requests/projects/[id]/helpers'
import type { ProjectDetailPayload } from '@/app/service-requests/projects/[id]/types'

const COMPANY = 10

function payload(overrides: Partial<ProjectDetailPayload> = {}): ProjectDetailPayload {
  return {
    project: { id: 'p1', ngo_id: 1, title: 'Library', pending_company_applications: [] },
    needs: [],
    need_breakdown: { ongoing: [], fulfilled: [], removed: [] },
    company_applications: [],
    lead_ngo_invites: [],
    csr_project_eligible_for_company_apply: true,
    ...overrides,
  }
}

const pending = { company_id: COMPANY, status: 'pending', needs: [] }

describe('keepOwnApplication', () => {
  it('re-merges a sticky application when GET omits company applications', () => {
    const next = keepOwnApplication(null, payload(), COMPANY, 'company', pending)
    expect(next.company_applications).toEqual([pending])
    expect(next.project.pending_company_applications).toEqual([{ company_id: COMPANY, status: 'pending' }])
  })

  it('keeps the previous application across a silent refetch that returns empty lists', () => {
    const previous = mergeOwnApplication(payload(), pending)
    const next = keepOwnApplication(previous, payload(), COMPANY, 'company')
    expect(next.company_applications).toEqual([pending])
  })

  it('uses the server application when GET includes it', () => {
    const listed = { company_id: COMPANY, status: 'accepted', needs: [{ id: 1, status: 'accepted' }] }
    const next = keepOwnApplication(null, payload({ company_applications: [listed] }), COMPANY, 'company', pending)
    expect(next.company_applications).toEqual([listed])
  })

  it('rehydrates from project meta when the grouped list is empty', () => {
    const next = keepOwnApplication(
      null,
      payload({
        project: {
          id: 'p1',
          ngo_id: 1,
          title: 'Library',
          pending_company_applications: [{ company_id: COMPANY, status: 'pending' }],
        },
      }),
      COMPANY,
      'company',
    )
    expect(next.company_applications).toEqual([expect.objectContaining({ company_id: COMPANY, status: 'pending' })])
  })
})

describe('readReturnedApplication', () => {
  it('reads application from nested POST success and already-applied payloads', () => {
    expect(
      readReturnedApplication(
        { projectId: 'p1', application: { company_id: COMPANY, status: 'pending', needs: [] } },
        COMPANY,
      ),
    ).toEqual(pending)
    expect(
      readReturnedApplication(
        { data: { application: { company_id: COMPANY, status: 'pending' } } },
        COMPANY,
      ),
    ).toEqual(pending)
  })
})
