import { describe, expect, it } from 'vitest'
import {
  describeIncompleteDelhiveryParty,
  emptyDelhiveryPartyForm,
  incompleteDelhiveryPartyFields,
  isCompleteDelhiveryPartyForm,
} from '@/components/delhivery-party-fields'

describe('Delhivery party form completeness', () => {
  const complete = {
    name: 'Hope Foundation NGO',
    phone: '1234567891',
    address: '12 Marine Drive',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
  }

  it('treats an empty street as incomplete', () => {
    expect(incompleteDelhiveryPartyFields({ ...complete, address: '' })).toEqual(['address'])
    expect(isCompleteDelhiveryPartyForm({ ...complete, address: '  ' })).toBe(false)
    expect(describeIncompleteDelhiveryParty('Delivery party', { ...complete, address: '' })).toBe(
      'Add street address on Delivery party.'
    )
  })

  it('accepts a fully filled party', () => {
    expect(isCompleteDelhiveryPartyForm(complete)).toBe(true)
    expect(describeIncompleteDelhiveryParty('Delivery party', complete)).toBeNull()
    expect(isCompleteDelhiveryPartyForm(emptyDelhiveryPartyForm())).toBe(false)
  })
})
