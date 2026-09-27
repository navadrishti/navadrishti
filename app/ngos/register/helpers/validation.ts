import { validateNgoHeadquartersLocation } from '@/lib/auth'
import type { FormErrors } from '@/components/registration/types'
import {
  getAccountFieldErrors,
  getHeadquartersFieldErrors,
  toHeadquartersInput,
} from '@/components/registration/validation'
import type { NgoRegistrationFormData } from '../types'

export function validateNgoRegistration(formData: NgoRegistrationFormData): FormErrors {
  const errors: FormErrors = {}

  if (!formData.ngoName.trim()) {
    errors.ngoName = 'NGO name is required'
  }

  Object.assign(errors, getAccountFieldErrors(formData))

  if (!formData.ngoVolunteerCapacity) {
    errors.ngoVolunteerCapacity = 'Exact NGO size is required'
  } else if (!/^[0-9]+$/.test(String(formData.ngoVolunteerCapacity).trim())) {
    errors.ngoVolunteerCapacity = 'Please enter a valid whole number for NGO size'
  }

  const locationError = validateNgoHeadquartersLocation(toHeadquartersInput(formData))
  Object.assign(errors, getHeadquartersFieldErrors(formData, locationError))

  if (!formData.registrationDate) {
    errors.registrationDate = 'Registration date is required'
  }

  if (formData.sectorsScheduleVii.length === 0) {
    errors.sectorsScheduleVii = 'Select at least one Schedule VII sector'
  }

  return errors
}
