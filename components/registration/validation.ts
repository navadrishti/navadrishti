import { normalizePincode } from '@/lib/auth'
import type { AccountFields, FormErrors, HeadquartersFields } from './types'

export function getAccountFieldErrors(data: AccountFields): FormErrors {
  const errors: FormErrors = {}

  if (!data.email.trim()) {
    errors.email = 'Email is required'
  } else if (!/\S+@\S+\.\S+/.test(data.email)) {
    errors.email = 'Email is invalid'
  }

  if (!data.phone.trim()) {
    errors.phone = 'Phone number is required'
  } else if (!/^[+]?[1-9]\d{1,14}$/.test(data.phone.replace(/\s+/g, ''))) {
    errors.phone = 'Please enter a valid phone number'
  }

  if (!data.password) {
    errors.password = 'Password is required'
  } else if (data.password.length < 8) {
    errors.password = 'Password must be at least 8 characters'
  }

  if (data.password !== data.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match'
  }

  return errors
}

export function toHeadquartersInput(data: HeadquartersFields) {
  return {
    address_line: data.addressLine,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    country: data.country,
  }
}

export function getHeadquartersFieldErrors(data: HeadquartersFields, locationError: string | null): FormErrors {
  const errors: FormErrors = {}

  if (!data.city.trim()) {
    errors.city = 'City is required'
  }

  if (!locationError) {
    return errors
  }

  if (!data.addressLine.trim()) {
    errors.addressLine = 'Registered office address is required'
  }
  if (!data.state.trim()) {
    errors.state = 'State / UT is required'
  }
  if (!data.pincode.trim()) {
    errors.pincode = 'Pincode is required'
  } else if (data.country === 'India' && !/^\d{6}$/.test(normalizePincode(data.pincode, 'India'))) {
    errors.pincode = 'Enter a valid 6-digit pincode'
  } else if (locationError.includes('state or UT')) {
    errors.state = 'Select a valid Indian state or UT'
  }

  return errors
}

export function buildHeadquarters(data: HeadquartersFields) {
  return {
    address_line: data.addressLine.trim(),
    city: data.city.trim(),
    state: data.state.trim(),
    pincode: normalizePincode(data.pincode, data.country),
    country: data.country,
  }
}
