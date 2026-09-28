import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from './field-error'
import type { EmailOtpControls, InputChangeHandler } from './types'

type EmailOtpFieldProps = {
  email: string
  onChange: InputChangeHandler
  placeholder: string
  emailError?: string
  otpError?: string
  otp: EmailOtpControls
}

export function EmailOtpField({
  email,
  onChange,
  placeholder,
  emailError,
  otpError,
  otp,
}: EmailOtpFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <div className="flex gap-2">
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={onChange}
          placeholder={placeholder}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => otp.send()}
          disabled={otp.sending || otp.cooldown > 0}
        >
          {otp.sending ? 'Sending...' : otp.cooldown > 0 ? `Resend in ${otp.cooldown}s` : 'Send OTP'}
        </Button>
      </div>
      <FieldError message={emailError} />
      {otp.sent && <p className="text-sm text-green-600">OTP sent to your email</p>}
      {otp.sent && (
        <div className="space-y-2">
          <Label htmlFor="emailOtp">Email OTP</Label>
          <div className="flex gap-2">
            <Input
              id="emailOtp"
              name="emailOtp"
              value={otp.code}
              onChange={(e) => otp.onCodeChange(e.target.value)}
              placeholder="Enter email OTP"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => otp.verify()}
              disabled={otp.verifying || otp.verified}
            >
              {otp.verifying ? 'Verifying...' : otp.verified ? 'Verified' : 'Verify OTP'}
            </Button>
          </div>
          <FieldError message={otpError} />
          {otp.verified && <p className="text-sm text-green-600">Email OTP verified</p>}
        </div>
      )}
    </div>
  )
}
