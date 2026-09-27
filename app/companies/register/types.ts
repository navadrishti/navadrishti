import type { RegistrationFormBase } from '@/components/registration/types'

export type CompanyRegistrationFormData = RegistrationFormBase & {
  companyName: string
  industry: string
  companySize: string
  website: string
  founded: string
  sector: string
  netWorth: string
  turnover: string
  netProfit: string
  csrVision: string
  focusAreasScheduleVii: string[]
  implementationModel: string
  governanceMechanism: string
}

export const INITIAL_COMPANY_FORM_DATA: CompanyRegistrationFormData = {
  companyName: '',
  industry: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  companySize: '',
  website: '',
  addressLine: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  founded: '',
  sector: '',
  netWorth: '',
  turnover: '',
  netProfit: '',
  csrVision: '',
  focusAreasScheduleVii: [],
  implementationModel: '',
  governanceMechanism: '',
}
