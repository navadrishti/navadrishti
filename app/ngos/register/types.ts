import {
  EMPTY_EXECUTION_CAPACITY,
  EMPTY_GEOGRAPHIC_COVERAGE_AREA,
  EMPTY_PAST_PROJECT,
  type NgoExecutionCapacity,
  type NgoGeographicCoverageArea,
  type NgoPastProject,
} from '@/lib/auth'
import type { RegistrationFormBase } from '@/components/registration/types'

export type NgoRegistrationFormData = RegistrationFormBase & {
  ngoName: string
  ngoVolunteerCapacity: string
  founded: string
  sector: string
  registrationDate: string
  sectorsScheduleVii: string[]
  pastProjects: NgoPastProject[]
  geographicCoverageAreas: NgoGeographicCoverageArea[]
  executionCapacity: NgoExecutionCapacity
}

export const INITIAL_NGO_FORM_DATA: NgoRegistrationFormData = {
  ngoName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  ngoVolunteerCapacity: '',
  addressLine: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  founded: '',
  sector: '',
  registrationDate: '',
  sectorsScheduleVii: [],
  pastProjects: [{ ...EMPTY_PAST_PROJECT }],
  geographicCoverageAreas: [{ ...EMPTY_GEOGRAPHIC_COVERAGE_AREA }],
  executionCapacity: { ...EMPTY_EXECUTION_CAPACITY },
}
