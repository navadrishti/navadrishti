import { validateCompanyHeadquartersLocation } from '@/lib/auth'
import type { FormErrors } from '@/components/registration/types'
import {
  getAccountFieldErrors,
  getHeadquartersFieldErrors,
  toHeadquartersInput,
} from '@/components/registration/validation'
import type { CompanyRegistrationFormData } from '../types'

export function validateCompanyRegistration(formData: CompanyRegistrationFormData): FormErrors {
  const errors: FormErrors = {}

  if (!formData.companyName.trim()) {
    errors.companyName = 'Company name is required'
  }

  if (!formData.industry) {
    errors.industry = 'Industry is required'
  }

  Object.assign(errors, getAccountFieldErrors(formData))

  if (!formData.companySize) {
    errors.companySize = 'Company size is required'
  }

  const locationError = validateCompanyHeadquartersLocation(toHeadquartersInput(formData))
  Object.assign(errors, getHeadquartersFieldErrors(formData, locationError))

  return errors
}
