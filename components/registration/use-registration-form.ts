'use client'

import { useState, type ChangeEvent } from 'react'
import { useOtpSender } from '@/hooks/use-otp-sender'
import type { EmailOtpControls, FormErrors, RegistrationFormBase } from './types'

export function useRegistrationForm<T extends RegistrationFormBase>(initialData: T) {
  const [formData, setFormData] = useState<T>(initialData)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [emailOtpCode, setEmailOtpCode] = useState('')
  const {
    otpSending,
    otpSent,
    otpCooldown,
    otpVerifying,
    otpVerified,
    handleSendEmailOtp,
    handleVerifyEmailOtp,
    resetEmailOtpState,
  } = useOtpSender(setFormErrors)

  const clearFieldError = (name: string) => {
    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target

    if (name === 'email' && value !== formData.email) {
      resetEmailOtpState()
      setEmailOtpCode('')
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
    clearFieldError(name)
  }

  const setField = <K extends keyof T & string>(name: K, value: T[K]) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
    clearFieldError(name)
  }

  const handleCountryChange = (value: string) => {
    setFormData((prev) => ({ ...prev, country: value }))
    clearFieldError('country')
    if (value !== 'India') {
      setFormData((prev) => ({ ...prev, state: '' }))
    }
  }

  const emailOtp: EmailOtpControls = {
    sending: otpSending.email,
    sent: otpSent.email,
    cooldown: otpCooldown.email,
    verifying: otpVerifying.email,
    verified: otpVerified.email,
    code: emailOtpCode,
    onCodeChange: (value) => {
      setEmailOtpCode(value)
      clearFieldError('emailOtp')
    },
    send: () => handleSendEmailOtp(formData.email),
    verify: () => handleVerifyEmailOtp(formData.email, emailOtpCode),
  }

  const ensureEmailOtpVerified = async (): Promise<boolean> => {
    if (!otpSent.email) {
      setFormErrors((prev) => ({ ...prev, emailOtp: 'Please send email OTP first' }))
      return false
    }

    if (otpVerified.email) {
      return true
    }

    if (!emailOtpCode.trim()) {
      setFormErrors((prev) => ({ ...prev, emailOtp: 'Please enter email OTP' }))
      return false
    }

    return handleVerifyEmailOtp(formData.email, emailOtpCode)
  }

  return {
    formData,
    setFormData,
    formErrors,
    setFormErrors,
    handleChange,
    setField,
    handleCountryChange,
    emailOtp,
    ensureEmailOtpVerified,
  }
}
