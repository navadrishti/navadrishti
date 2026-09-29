import {
  INDIAN_STATES_AND_UTS,
  buildNgoLocationDisplay,
  normalizePincode,
} from '@/lib/auth'

function readAddressTextField(value: unknown): string {
  return String(value ?? '').trim()
}

export type ProjectExactAddress = {
  address_line: string
  region: string
  district: string
  city: string
  state: string
  pincode: string
  country: string
}

export const EMPTY_PROJECT_ADDRESS: ProjectExactAddress = {
  address_line: '',
  region: '',
  district: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
}

function normalizeProjectAddress(input: Partial<ProjectExactAddress>): ProjectExactAddress {
  const country = readAddressTextField(input.country) || 'India'
  return {
    address_line: readAddressTextField(input.address_line),
    region: readAddressTextField(input.region),
    district: readAddressTextField(input.district),
    city: readAddressTextField(input.city),
    state: readAddressTextField(input.state),
    pincode: normalizePincode(String(input.pincode || ''), country),
    country,
  }
}

export function parseProjectExactAddress(raw: unknown): ProjectExactAddress {
  if (!raw) return { ...EMPTY_PROJECT_ADDRESS }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeProjectAddress(raw as Partial<ProjectExactAddress>)
  }

  const text = String(raw).trim()
  if (!text) return { ...EMPTY_PROJECT_ADDRESS }

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeProjectAddress(parsed as Partial<ProjectExactAddress>)
      }
    } catch {
      // Fall through to legacy plain-text handling.
    }
  }

  return normalizeProjectAddress({
    address_line: text,
    city: text.includes(',') ? text.split(',')[0]?.trim() || text : text,
  })
}

export function serializeProjectExactAddress(input: Partial<ProjectExactAddress>): string {
  return JSON.stringify(normalizeProjectAddress(input))
}

export function formatProjectExactAddress(raw: unknown): string {
  const address = parseProjectExactAddress(raw)
  const parts = [
    address.address_line,
    address.region,
    address.district,
    address.city,
    address.state,
    address.pincode,
  ]
    .map((part) => readAddressTextField(part))
    .filter(Boolean)

  if (parts.length === 0) return 'Not set'
  return [...parts, address.country].join(', ')
}

export function validateProjectExactAddress(input: Partial<ProjectExactAddress>): string | null {
  const address = normalizeProjectAddress(input)

  if (!address.address_line) {
    return 'Street / building address is required.'
  }
  if (!address.city) {
    return 'City / town is required.'
  }
  if (!address.state) {
    return 'State / UT is required.'
  }
  if (!address.pincode) {
    return 'Pincode is required.'
  }

  if (address.country === 'India') {
    if (!/^\d{6}$/.test(address.pincode)) {
      return 'Enter a valid 6-digit Indian pincode.'
    }
    if (!INDIAN_STATES_AND_UTS.some((item) => item.toLowerCase() === address.state.toLowerCase())) {
      return 'Select a valid Indian state or UT.'
    }
  }

  return null
}

export function projectAddressToLocationSummary(address: Partial<ProjectExactAddress>): string {
  const normalized = normalizeProjectAddress(address)
  return buildNgoLocationDisplay({
    city: normalized.city,
    state: normalized.state,
    pincode: normalized.pincode,
    country: normalized.country,
  })
}

function readStructuredAddress(candidate: unknown): Partial<ProjectExactAddress> | null {
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate as Partial<ProjectExactAddress>
  }
  try {
    const parsed = JSON.parse(String(candidate))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function formatProjectLocation(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const isObject = Boolean(candidate) && typeof candidate === 'object'
    const text = isObject ? '' : readAddressTextField(candidate)
    if (!isObject && !text) continue
    if (!isObject && !text.startsWith('{')) return text

    const structured = readStructuredAddress(isObject ? candidate : text)
    if (!structured) continue
    const address = normalizeProjectAddress(structured)
    if (!address.city && !address.state && !address.pincode) continue
    return projectAddressToLocationSummary(address)
  }
  return ''
}

export function toProjectAddressDateInput(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}
