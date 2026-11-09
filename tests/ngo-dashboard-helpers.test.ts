import { describe, expect, it } from 'vitest'
import { partitionCompanyApplications } from '@/app/ngos/dashboard/helpers'

describe('partitionCompanyApplications', () => {
  it('keeps pending applications in review and moves decided ones to history', () => {
    expect(partitionCompanyApplications([
      { id: 'a', status: 'pending' },
      { id: 'b', status: 'accepted' },
      { id: 'c', status: 'rejected' },
      { id: 'd', status: 'expired' },
      { id: 'e', status: 'pledged' },
    ])).toEqual({
      review: [{ id: 'a', status: 'pending' }, { id: 'e', status: 'pledged' }],
      history: [
        { id: 'b', status: 'accepted' },
        { id: 'c', status: 'rejected' },
        { id: 'd', status: 'expired' },
      ],
    })
  })
})
