import { describe, expect, it } from 'vitest'
import { buildCompanySignupData } from '@/app/companies/register/helpers/build-signup-data'
import { buildNgoSignupData } from '@/app/ngos/register/helpers/build-signup-data'
import { INITIAL_COMPANY_FORM_DATA } from '@/app/companies/register/types'
import { INITIAL_NGO_FORM_DATA } from '@/app/ngos/register/types'

describe('registration signup payloads', () => {
  it('sends company location and profile fields the API requires', () => {
    expect(buildCompanySignupData({
      ...INITIAL_COMPANY_FORM_DATA,
      companyName: 'Acme Ltd',
      industry: 'technology',
      companySize: '11-50',
      email: 'hr@acme.com',
      phone: '9876543210',
      password: 'secret123',
      addressLine: '9 Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      website: 'https://acme.com',
    })).toMatchObject({
      email: 'hr@acme.com',
      name: 'Acme Ltd',
      user_type: 'company',
      phone: '9876543210',
      city: 'Mumbai',
      state_province: 'Maharashtra',
      pincode: '400001',
      country: 'India',
      profile_data: {
        company_name: 'Acme Ltd',
        industry: 'technology',
        company_size: '11-50',
        website: 'https://acme.com',
        company_headquarters: {
          address_line: '9 Marine Drive',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
        },
      },
    })
  })

  it('sends NGO capacity, sectors, and headquarters the API requires', () => {
    expect(buildNgoSignupData({
      ...INITIAL_NGO_FORM_DATA,
      ngoName: 'Seva Trust',
      email: 'seva@example.org',
      phone: '9876543210',
      password: 'secret123',
      ngoVolunteerCapacity: '12',
      addressLine: '1 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      registrationDate: '2015-04-01',
      sectorsScheduleVii: ['Education and Livelihood Enhancement'],
    })).toMatchObject({
      email: 'seva@example.org',
      name: 'Seva Trust',
      user_type: 'ngo',
      ngo_volunteer_capacity: 12,
      city: 'Bengaluru',
      state_province: 'Karnataka',
      pincode: '560001',
      profile_data: {
        ngo_name: 'Seva Trust',
        registration_date: '2015-04-01',
        sectors_schedule_vii: ['Education and Livelihood Enhancement'],
        team_strength: '12',
        ngo_volunteer_capacity: 12,
      },
    })
  })
})
