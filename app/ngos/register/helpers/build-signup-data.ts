import { buildNgoLocationDisplay } from '@/lib/auth'
import { buildHeadquarters } from '@/components/registration/validation'
import type { NgoRegistrationFormData } from '../types'

function parseVolunteerCapacity(value: string): number | undefined {
  return value ? Number(String(value).replace(/[^0-9]/g, '')) : undefined
}

export function buildNgoSignupData(formData: NgoRegistrationFormData) {
  const pastProjects = formData.pastProjects
    .map((project) => ({
      title: project.title.trim(),
      description: project.description.trim(),
    }))
    .filter((project) => project.title)

  const geographicCoverage = formData.geographicCoverageAreas
    .map((area) => ({
      region: area.region.trim(),
      state: area.state.trim(),
      district: area.district.trim(),
      area_type: area.area_type,
    }))
    .filter((area) => area.state || area.region || area.district)

  const executionCapacity = {
    concurrent_projects: formData.executionCapacity.concurrent_projects.trim(),
    annual_beneficiaries: formData.executionCapacity.annual_beneficiaries.trim(),
    delivery_model: formData.executionCapacity.delivery_model,
    notes: formData.executionCapacity.notes.trim(),
  }
  const hasExecutionCapacity = Boolean(
    executionCapacity.concurrent_projects ||
      executionCapacity.annual_beneficiaries ||
      executionCapacity.delivery_model ||
      executionCapacity.notes
  )

  const headquarters = buildHeadquarters(formData)
  const volunteerCapacity = parseVolunteerCapacity(formData.ngoVolunteerCapacity)

  return {
    email: formData.email,
    password: formData.password,
    name: formData.ngoName,
    user_type: 'ngo' as const,
    phone: formData.phone.trim(),
    city: headquarters.city,
    state_province: headquarters.state,
    pincode: headquarters.pincode,
    country: headquarters.country,
    location: buildNgoLocationDisplay(headquarters),
    // Top-level copy populates the `ngo_volunteer_capacity` DB column.
    ngo_volunteer_capacity: volunteerCapacity,
    profile_data: {
      ngo_name: formData.ngoName,
      founded: formData.founded,
      sector: formData.sectorsScheduleVii[0] || '',
      registration_date: formData.registrationDate,
      sectors_schedule_vii: formData.sectorsScheduleVii,
      past_projects: pastProjects.length > 0 ? pastProjects : undefined,
      geographic_coverage: geographicCoverage.length > 0 ? geographicCoverage : undefined,
      execution_capacity: hasExecutionCapacity ? executionCapacity : undefined,
      ngo_headquarters: headquarters,
      team_strength: String(formData.ngoVolunteerCapacity).trim(),
      ngo_volunteer_capacity: volunteerCapacity,
    },
  }
}
