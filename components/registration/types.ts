import type { ChangeEvent } from 'react'

export type FormErrors = Record<string, string>

export type InputChangeHandler = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void

export type AccountFields = {
  email: string
  phone: string
  password: string
  confirmPassword: string
}

export type HeadquartersFields = {
  addressLine: string
  city: string
  state: string
  pincode: string
  country: string
}

export type RegistrationFormBase = AccountFields & HeadquartersFields

export type EmailOtpControls = {
  sending: boolean
  sent: boolean
  cooldown: number
  verifying: boolean
  verified: boolean
  code: string
  onCodeChange: (value: string) => void
  send: () => Promise<void>
  verify: () => Promise<boolean>
}
