import { buildNgoLocationDisplay } from '@/lib/auth'
import { buildHeadquarters } from '@/components/registration/validation'
import type { CompanyRegistrationFormData } from '../types'

export function buildCompanySignupData(formData: CompanyRegistrationFormData) {
  const headquarters = buildHeadquarters(formData)

  const profileData: Record<string, unknown> = {
    company_name: formData.companyName,
    industry: formData.industry,
    company_size: formData.companySize,
    company_headquarters: headquarters,
  }

  if (formData.website.trim()) profileData.website = formData.website.trim()
  if (formData.founded) profileData.founded = parseInt(formData.founded)
  if (formData.sector.trim()) profileData.sector = formData.sector.trim()
  if (formData.netWorth.trim()) profileData.net_worth = formData.netWorth.trim()
  if (formData.turnover.trim()) profileData.turnover = formData.turnover.trim()
  if (formData.netProfit.trim()) profileData.net_profit = formData.netProfit.trim()
  if (formData.csrVision.trim()) profileData.csr_vision = formData.csrVision.trim()
  if (formData.focusAreasScheduleVii.length > 0) {
    profileData.focus_areas_schedule_vii = formData.focusAreasScheduleVii
  }
  if (formData.implementationModel) profileData.implementation_model = formData.implementationModel
  if (formData.governanceMechanism) profileData.governance_mechanism = formData.governanceMechanism

  return {
    email: formData.email,
    password: formData.password,
    name: formData.companyName,
    user_type: 'company' as const,
    phone: formData.phone.trim(),
    city: headquarters.city,
    state_province: headquarters.state,
    pincode: headquarters.pincode,
    country: headquarters.country,
    location: buildNgoLocationDisplay(headquarters),
    profile_data: profileData,
  }
}
