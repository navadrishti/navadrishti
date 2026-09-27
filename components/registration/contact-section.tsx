import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmailOtpField } from './email-otp-field'
import { FieldError } from './field-error'
import type { AccountFields, EmailOtpControls, FormErrors, InputChangeHandler } from './types'

type ContactSectionProps = {
  values: AccountFields
  errors: FormErrors
  onChange: InputChangeHandler
  emailOtp: EmailOtpControls
  emailPlaceholder: string
  passwordPlaceholder?: string
  confirmPasswordPlaceholder?: string
}

export function ContactSection({
  values,
  errors,
  onChange,
  emailOtp,
  emailPlaceholder,
  passwordPlaceholder,
  confirmPasswordPlaceholder,
}: ContactSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Contact Information</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EmailOtpField
          email={values.email}
          onChange={onChange}
          placeholder={emailPlaceholder}
          emailError={errors.email}
          otpError={errors.emailOtp}
          otp={emailOtp}
        />

        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            value={values.phone}
            onChange={onChange}
            placeholder="+91 9876543210"
          />
          <FieldError message={errors.phone} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            value={values.password}
            onChange={onChange}
            placeholder={passwordPlaceholder}
          />
          <FieldError message={errors.password} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={values.confirmPassword}
            onChange={onChange}
            placeholder={confirmPasswordPlaceholder}
          />
          <FieldError message={errors.confirmPassword} />
        </div>
      </div>
    </div>
  )
}
