'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import {
  EMPTY_GEOGRAPHIC_COVERAGE_AREA,
  EMPTY_PAST_PROJECT,
  normalizePincode,
  type NgoExecutionCapacity,
  type NgoGeographicCoverageArea,
  type NgoPastProject,
} from '@/lib/auth'
import { useRegistrationForm } from '@/components/registration/use-registration-form'
import { buildNgoSignupData } from './helpers/build-signup-data'
import { validateNgoRegistration } from './helpers/validation'
import { INITIAL_NGO_FORM_DATA } from './types'

export function useNgoRegistration() {
  const form = useRegistrationForm(INITIAL_NGO_FORM_DATA)
  const { formData, setFormData, setFormErrors, ensureEmailOtpVerified } = form
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { signup, error, clearError } = useAuth()
  const router = useRouter()

  const updatePastProject = (index: number, field: keyof NgoPastProject, value: string) => {
    setFormData((prev) => ({
      ...prev,
      pastProjects: prev.pastProjects.map((project, projectIndex) =>
        projectIndex === index ? { ...project, [field]: value } : project
      ),
    }))
  }

  const addPastProject = () => {
    setFormData((prev) => ({
      ...prev,
      pastProjects: [...prev.pastProjects, { ...EMPTY_PAST_PROJECT }],
    }))
  }

  const removePastProject = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      pastProjects:
        prev.pastProjects.length === 1
          ? [{ ...EMPTY_PAST_PROJECT }]
          : prev.pastProjects.filter((_, projectIndex) => projectIndex !== index),
    }))
  }

  const updateGeographicArea = (index: number, field: keyof NgoGeographicCoverageArea, value: string) => {
    setFormData((prev) => ({
      ...prev,
      geographicCoverageAreas: prev.geographicCoverageAreas.map((area, areaIndex) =>
        areaIndex === index ? { ...area, [field]: value } : area
      ),
    }))
  }

  const addGeographicArea = () => {
    setFormData((prev) => ({
      ...prev,
      geographicCoverageAreas: [...prev.geographicCoverageAreas, { ...EMPTY_GEOGRAPHIC_COVERAGE_AREA }],
    }))
  }

  const removeGeographicArea = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      geographicCoverageAreas:
        prev.geographicCoverageAreas.length === 1
          ? [{ ...EMPTY_GEOGRAPHIC_COVERAGE_AREA }]
          : prev.geographicCoverageAreas.filter((_, areaIndex) => areaIndex !== index),
    }))
  }

  const updateExecutionCapacity = (field: keyof NgoExecutionCapacity, value: string) => {
    setFormData((prev) => ({
      ...prev,
      executionCapacity: {
        ...prev.executionCapacity,
        [field]: value,
      },
    }))
  }

  const setPincode = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      pincode: normalizePincode(value, prev.country),
    }))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    clearError()

    const errors = validateNgoRegistration(formData)
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    if (!(await ensureEmailOtpVerified())) {
      return
    }

    try {
      setIsSubmitting(true)
      await signup(buildNgoSignupData(formData))
      toast.success('NGO account created successfully!')
      router.push('/ngos/dashboard')
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
    setPincode,
    pastProjects: { update: updatePastProject, add: addPastProject, remove: removePastProject },
    geographicAreas: { update: updateGeographicArea, add: addGeographicArea, remove: removeGeographicArea },
    updateExecutionCapacity,
  }
}
