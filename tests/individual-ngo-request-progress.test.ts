import { describe, expect, it } from 'vitest'
import {
  describeNeedLifecycleStatus,
  describeNgoNeedMode,
  getNgoRequestFulfillmentStage,
  getNgoRequestProgress,
} from '@/app/individuals/dashboard/helpers'
import type { IndividualNgoRequestApplication } from '@/app/individuals/dashboard/types'

function application(
  overrides: Partial<IndividualNgoRequestApplication> & {
    request?: IndividualNgoRequestApplication['request']
  } = {}
): IndividualNgoRequestApplication {
  return {
    id: 11,
    status: 'accepted',
    assigned_amount: 1200,
    request: {
      id: 42,
      title: 'E2E Marketplace Audit Need - Skill Service (edited)',
      request_type: 'skill_service',
      location: 'Delhi NCR',
      ngo: { name: 'E2E Synthetic NGO Trust', verification_status: 'verified' },
      ...(overrides.request || {}),
    },
    ...overrides,
  }
}

describe('individual NGO request progress helpers', () => {
  it('describes skill service needs clearly', () => {
    expect(describeNgoNeedMode('skill_service').label).toBe('Skill / service')
  })

  it('marks completed history at 100%', () => {
    const row = application({ status: 'completed' })
    expect(getNgoRequestFulfillmentStage(row).label).toBe('Completed')
    expect(getNgoRequestProgress(row)).toMatchObject({
      percent: 100,
      caption: 'Fulfillment complete',
    })
  })

  it('shows pending applications as early progress', () => {
    const row = application({ status: 'pending' })
    expect(getNgoRequestProgress(row).percent).toBe(15)
    expect(getNgoRequestFulfillmentStage(row).label).toBe('Awaiting NGO review')
  })

  it('tracks material delivery stages', () => {
    const row = application({
      status: 'accepted',
      request: {
        id: 42,
        title: 'Material kit',
        request_type: 'material',
      },
      response_meta: { delivery_tracking_last_status: 'In Transit' },
    })
    expect(getNgoRequestFulfillmentStage(row).label).toBe('In delivery')
    expect(getNgoRequestProgress(row).percent).toBe(60)
  })

  it('maps need listing statuses to Active / Ongoing / Closed', () => {
    expect(describeNeedLifecycleStatus('active')?.label).toBe('Active')
    expect(describeNeedLifecycleStatus('in_progress')?.label).toBe('Ongoing')
    expect(describeNeedLifecycleStatus('completed')?.label).toBe('Closed')
    expect(describeNeedLifecycleStatus('closed')?.label).toBe('Closed')
    expect(describeNeedLifecycleStatus('cancelled')?.label).toBe('Cancelled')
  })

  it('keeps need listing lifecycle separate from application completion', () => {
    const row = application({
      status: 'completed',
      request: {
        id: 42,
        title: 'E2E Marketplace Audit Need - Skill Service (edited)',
        request_type: 'skill_service',
        status: 'active',
        location: 'Delhi NCR',
        ngo: { name: 'E2E Synthetic NGO Trust', verification_status: 'verified' },
      },
    })
    expect(describeNeedLifecycleStatus(row.request?.status)?.label).toBe('Active')
    expect(getNgoRequestFulfillmentStage(row).label).toBe('Completed')
  })
})
