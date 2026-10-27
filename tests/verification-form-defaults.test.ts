import { describe, expect, it } from 'vitest'
import { getUserFormDefaults } from '@/app/verification/helpers'
import type { User } from '@/lib/auth-context'

function user(partial: Partial<User> & Pick<User, 'user_type'>): User {
  return {
    id: 1,
    email: 'a@b.c',
    name: 'Acme',
    phone: '9999999999',
    ...partial,
  } as User
}

describe('getUserFormDefaults', () => {
  it('prefills company fields from the last verification so reverify uses the same form', () => {
    expect(
      getUserFormDefaults(
        user({
          user_type: 'company',
          profile_data: {
            verification_documents: {
              company: {
                entered_fields: {
                  pan: 'AAAPL1234C',
                  gst: '27AAAPL1234C1Z5',
                  cin: 'U12345MH2020PTC000001',
                  registration_number: 'REG-1',
                },
              },
            },
          },
        })
      )
    ).toMatchObject({
      category: 'company',
      panNumber: 'AAAPL1234C',
      companyGstNumber: '27AAAPL1234C1Z5',
      companyGstApplicable: true,
      companyCinNumber: 'U12345MH2020PTC000001',
      registrationNumber: 'REG-1',
    })
  })

  it('prefills individual fields from the last verification', () => {
    expect(
      getUserFormDefaults(
        user({
          user_type: 'individual',
          profile_data: {
            verification_documents: {
              individual: { entered_fields: { aadhaar: '123456789012', pan: 'ABCDE1234F' } },
            },
          },
        })
      )
    ).toMatchObject({
      category: 'individual',
      aadhaarNumber: '123456789012',
      panNumber: 'ABCDE1234F',
    })
  })
})
