"use client"

import { useState } from 'react'
import {
  normalizeCompanyFocusAreasScheduleVii,
  normalizeCompanyGovernanceMechanism,
  normalizeCompanyImplementationModel,
} from '@/lib/categories'
import {
  EMPTY_EXECUTION_CAPACITY,
  EMPTY_GEOGRAPHIC_COVERAGE_AREA,
  buildNgoLocationDisplay,
  getComplianceDocumentUrl,
  normalizeExecutionCapacity,
  normalizeGeographicCoverage,
  normalizePincode,
  validateNgoHeadquartersLocation,
  validateCompanyHeadquartersLocation,
  type ComplianceDocuments,
  type NgoExecutionCapacity,
  type NgoGeographicCoverageArea,
} from '@/lib/auth'
import type { FetchedProfileUser, ProfileData, ProfileIdentityFields, ProfileUpdatePayload } from './types'

const text = (value: unknown): string => (value ? String(value) : '')

const headquartersFrom = (value: unknown): Record<string, string> =>
  value && typeof value === 'object' ? (value as Record<string, string>) : {}

export function useProfileDetails() {
  const [city, setCity] = useState('')
  const [stateProvince, setStateProvince] = useState('')
  const [pincode, setPincode] = useState('')
  const [country, setCountry] = useState('India')
  const [bio, setBio] = useState('')
  const [sector, setSector] = useState('')
  const [foundedYear, setFoundedYear] = useState('')
  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [ngoVolunteerCapacity, setNgoVolunteerCapacity] = useState('')
  const [twelveANumber, setTwelveANumber] = useState('')
  const [eightyGNumber, setEightyGNumber] = useState('')
  const [csr1RegistrationNumber, setCsr1RegistrationNumber] = useState('')
  const [complianceDocuments, setComplianceDocuments] = useState<ComplianceDocuments>({})
  const [age, setAge] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [registrationDate, setRegistrationDate] = useState('')
  const [sectorsScheduleVii, setSectorsScheduleVii] = useState<string[]>([])
  const [geographicCoverageAreas, setGeographicCoverageAreas] = useState<NgoGeographicCoverageArea[]>([
    { ...EMPTY_GEOGRAPHIC_COVERAGE_AREA },
  ])
  const [executionCapacity, setExecutionCapacity] = useState<NgoExecutionCapacity>({ ...EMPTY_EXECUTION_CAPACITY })
  const [netWorth, setNetWorth] = useState('')
  const [turnover, setTurnover] = useState('')
  const [netProfit, setNetProfit] = useState('')
  const [csrVision, setCsrVision] = useState('')
  const [focusAreasScheduleVii, setFocusAreasScheduleVii] = useState<string[]>([])
  const [implementationModel, setImplementationModel] = useState('')
  const [governanceMechanism, setGovernanceMechanism] = useState('')

  const addGeographicArea = () => {
    setGeographicCoverageAreas((prev) => [...prev, { ...EMPTY_GEOGRAPHIC_COVERAGE_AREA }])
  }

  const removeGeographicArea = (index: number) => {
    setGeographicCoverageAreas((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  const updateGeographicArea = (
    index: number,
    field: keyof NgoGeographicCoverageArea,
    value: string
  ) => {
    setGeographicCoverageAreas((prev) =>
      prev.map((area, itemIndex) => (itemIndex === index ? { ...area, [field]: value } : area))
    )
  }

  const updateExecutionCapacityField = (field: keyof NgoExecutionCapacity, value: string) => {
    setExecutionCapacity((prev) => ({ ...prev, [field]: value }))
  }

  const applyFetchedProfile = (freshUser: FetchedProfileUser | undefined) => {
    const userProfile: ProfileData = freshUser?.profile_data || {}

    setCity(freshUser?.city || '')
    setStateProvince(freshUser?.state_province || '')
    setPincode(freshUser?.pincode || '')
    setCountry(freshUser?.country || 'India')
    setBio(text(userProfile.bio) || freshUser?.bio || '')
    setSector(text(userProfile.sector))
    setFoundedYear(text(userProfile.founded) || text(userProfile.founded_year))
    setWebsite(text(userProfile.website) || text(userProfile.company_website) || text(userProfile.organization_website))
    setIndustry(text(userProfile.industry))
    setCompanySize(text(userProfile.company_size))
    setNgoVolunteerCapacity(String(freshUser?.ngo_volunteer_capacity ?? userProfile.ngo_volunteer_capacity ?? ''))
    setTwelveANumber(String(userProfile.twelve_a_number || ''))
    setEightyGNumber(String(userProfile.eighty_g_number || ''))
    setCsr1RegistrationNumber(String(userProfile.csr1_registration_number || ''))

    const existingComplianceDocuments =
      userProfile.compliance_documents && typeof userProfile.compliance_documents === 'object'
        ? (userProfile.compliance_documents as ComplianceDocuments)
        : {}

    setComplianceDocuments({
      twelve_a: getComplianceDocumentUrl(existingComplianceDocuments.twelve_a),
      eighty_g: getComplianceDocumentUrl(existingComplianceDocuments.eighty_g),
      csr1: getComplianceDocumentUrl(existingComplianceDocuments.csr1),
    })
    setAge(text(userProfile.age))

    if (freshUser?.user_type === 'individual') {
      setAddressLine(headquartersFrom(userProfile.home_address).address_line || '')
    }

    if (freshUser?.user_type === 'ngo') {
      setAddressLine(headquartersFrom(userProfile.ngo_headquarters).address_line || '')
      setRegistrationDate(String(userProfile.registration_date || ''))
      setSectorsScheduleVii(
        Array.isArray(userProfile.sectors_schedule_vii)
          ? userProfile.sectors_schedule_vii.filter((item: unknown): item is string => typeof item === 'string')
          : []
      )

      const normalizedGeographicCoverage = normalizeGeographicCoverage(userProfile.geographic_coverage)
      setGeographicCoverageAreas(
        normalizedGeographicCoverage.length > 0
          ? normalizedGeographicCoverage
          : [{ ...EMPTY_GEOGRAPHIC_COVERAGE_AREA }]
      )

      setExecutionCapacity(
        normalizeExecutionCapacity(userProfile.execution_capacity) || { ...EMPTY_EXECUTION_CAPACITY }
      )
    }

    if (freshUser?.user_type === 'company') {
      setAddressLine(headquartersFrom(userProfile.company_headquarters).address_line || '')
      setNetWorth(String(userProfile.net_worth || ''))
      setTurnover(String(userProfile.turnover || ''))
      setNetProfit(String(userProfile.net_profit || ''))
      setCsrVision(String(userProfile.csr_vision || ''))
      setFocusAreasScheduleVii(normalizeCompanyFocusAreasScheduleVii(userProfile.focus_areas_schedule_vii))
      setImplementationModel(normalizeCompanyImplementationModel(userProfile.implementation_model))
      setGovernanceMechanism(normalizeCompanyGovernanceMechanism(userProfile.governance_mechanism))
    }
  }

  const getHeadquartersError = (userType: string): string | null => {
    const location = { address_line: addressLine, city, state: stateProvince, pincode, country }
    if (userType === 'ngo') return validateNgoHeadquartersLocation(location)
    if (userType === 'company') return validateCompanyHeadquartersLocation(location)
    return null
  }

  const buildHeadquarters = () => ({
    address_line: addressLine.trim(),
    city: city.trim(),
    state: stateProvince.trim(),
    pincode: normalizePincode(pincode, country),
    country,
  })

  const buildProfilePayload = (
    userType: string,
    identity: ProfileIdentityFields,
    fallbackName: string | undefined
  ): ProfileUpdatePayload => {
    const profileData: ProfileData = { bio }
    const payload: ProfileUpdatePayload = {
      name: identity.name,
      email: identity.email,
      phone: identity.phone,
      city,
      state_province: stateProvince,
      pincode,
      country,
      profileImageUrl: identity.profileImageUrl,
      coverImageUrl: identity.coverImageUrl,
      bio,
      profile_data: profileData,
    }

    if (userType === 'individual' && age) {
      profileData.age = parseInt(age)
    }

    if (userType === 'individual') {
      profileData.home_address = buildHeadquarters()
    }

    if (userType === 'company') {
      const headquarters = buildHeadquarters()

      payload.location = buildNgoLocationDisplay(headquarters)
      profileData.industry = industry
      profileData.company_size = companySize
      profileData.website = website.trim() || undefined
      profileData.sector = sector.trim() || undefined
      if (foundedYear) profileData.founded = parseInt(foundedYear)
      profileData.company_name = identity.name || fallbackName
      profileData.company_headquarters = headquarters
      profileData.net_worth = netWorth.trim() || undefined
      profileData.turnover = turnover.trim() || undefined
      profileData.net_profit = netProfit.trim() || undefined
      profileData.csr_vision = csrVision.trim() || undefined
      if (focusAreasScheduleVii.length > 0) {
        profileData.focus_areas_schedule_vii = focusAreasScheduleVii
      }
      profileData.implementation_model = implementationModel || undefined
      profileData.governance_mechanism = governanceMechanism || undefined
    }

    if (userType === 'ngo') {
      const headquarters = buildHeadquarters()

      const normalizedGeographicCoverage = geographicCoverageAreas
        .map((area) => ({
          region: area.region.trim(),
          state: area.state.trim(),
          district: area.district.trim(),
          area_type: area.area_type,
        }))
        .filter((area) => area.state || area.region || area.district)

      const normalizedExecutionCapacity = {
        concurrent_projects: executionCapacity.concurrent_projects.trim(),
        annual_beneficiaries: executionCapacity.annual_beneficiaries.trim(),
        delivery_model: executionCapacity.delivery_model,
        notes: executionCapacity.notes.trim(),
      }
      const hasExecutionCapacity = Boolean(
        normalizedExecutionCapacity.concurrent_projects ||
          normalizedExecutionCapacity.annual_beneficiaries ||
          normalizedExecutionCapacity.delivery_model ||
          normalizedExecutionCapacity.notes
      )

      if (ngoVolunteerCapacity) {
        payload.ngo_volunteer_capacity = Number(String(ngoVolunteerCapacity).replace(/[^0-9]/g, ''))
      }

      payload.location = buildNgoLocationDisplay(headquarters)
      profileData.sector = sectorsScheduleVii[0] || undefined
      if (foundedYear) profileData.founded = parseInt(foundedYear)
      profileData.ngo_name = identity.name || fallbackName
      profileData.registration_date = registrationDate
      profileData.sectors_schedule_vii = sectorsScheduleVii
      profileData.geographic_coverage = normalizedGeographicCoverage
      profileData.execution_capacity = hasExecutionCapacity
        ? normalizedExecutionCapacity
        : null
      profileData.ngo_headquarters = headquarters
      profileData.team_strength = String(ngoVolunteerCapacity).trim()
      profileData.twelve_a_number = twelveANumber.trim()
      profileData.eighty_g_number = eightyGNumber.trim()
      profileData.csr1_registration_number = csr1RegistrationNumber.trim()
      profileData.compliance_documents = complianceDocuments
      if (ngoVolunteerCapacity) {
        profileData.ngo_volunteer_capacity = Number(
          String(ngoVolunteerCapacity).replace(/[^0-9]/g, '')
        )
      }
    }

    return payload
  }

  return {
    city, setCity,
    stateProvince, setStateProvince,
    pincode, setPincode,
    country, setCountry,
    bio, setBio,
    sector, setSector,
    foundedYear, setFoundedYear,
    website, setWebsite,
    industry, setIndustry,
    companySize, setCompanySize,
    ngoVolunteerCapacity, setNgoVolunteerCapacity,
    complianceDocuments, setComplianceDocuments,
    age, setAge,
    addressLine, setAddressLine,
    registrationDate, setRegistrationDate,
    sectorsScheduleVii, setSectorsScheduleVii,
    geographicCoverageAreas,
    executionCapacity,
    netWorth, setNetWorth,
    turnover, setTurnover,
    netProfit, setNetProfit,
    csrVision, setCsrVision,
    focusAreasScheduleVii, setFocusAreasScheduleVii,
    implementationModel, setImplementationModel,
    governanceMechanism, setGovernanceMechanism,
    addGeographicArea,
    removeGeographicArea,
    updateGeographicArea,
    updateExecutionCapacityField,
    applyFetchedProfile,
    getHeadquartersError,
    buildProfilePayload,
  }
}

export type ProfileDetails = ReturnType<typeof useProfileDetails>
