'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useRegistrationForm } from '@/components/registration/use-registration-form'
import { buildCompanySignupData } from './helpers/build-signup-data'
import { validateCompanyRegistration } from './helpers/validation'
import { INITIAL_COMPANY_FORM_DATA } from './types'

export function useCompanyRegistration() {
  const form = useRegistrationForm(INITIAL_COMPANY_FORM_DATA)
  const { formData, setFormErrors, ensureEmailOtpVerified } = form
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { signup, error, clearError } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    clearError()

    const errors = validateCompanyRegistration(formData)
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    if (!(await ensureEmailOtpVerified())) {
      return
    }

    try {
      setIsSubmitting(true)
      await signup(buildCompanySignupData(formData))
      toast.success('Company account created successfully!')
      router.push('/companies/dashboard')
    } catch {
      // signup() already surfaces the error via auth context state and a toast.
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    ...form,
    error,
    isSubmitting,
    handleSubmit,
  }
}
