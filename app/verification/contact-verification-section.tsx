import type { Dispatch, SetStateAction } from 'react';
import type { useOtpSender } from '@/hooks/use-otp-sender';
import { PHONE_VERIFICATION_ENABLED } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FormErrors } from './types';

type OtpSender = ReturnType<typeof useOtpSender>;
type OtpInput = { email: string; phone: string };

interface OtpChannelProps {
  label: string;
  sendLabel: string;
  verified: boolean;
  sending: boolean;
  sent: boolean;
  verifying: boolean;
  cooldown: number;
  error?: string;
  otpError?: string;
  otpValue: string;
  onOtpChange: (value: string) => void;
  onSend: () => void;
  onVerify: () => void;
}

function OtpChannel({
  label,
  sendLabel,
  verified,
  sending,
  sent,
  verifying,
  cooldown,
  error,
  otpError,
  otpValue,
  onOtpChange,
  onSend,
  onVerify
}: OtpChannelProps) {
  return (
    <div>
      <p>
        {label}{' '}
        <span className="font-medium">{verified ? 'Verified' : 'Not Verified'}</span>
      </p>
      {!verified && (
        <div className="mt-2 space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSend}
            disabled={sending || cooldown > 0}
          >
            {sending
              ? 'Sending...'
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : sent
                  ? 'Resend OTP'
                  : sendLabel}
          </Button>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {sent && (
            <div className="space-y-2">
              <Input
                value={otpValue}
                onChange={(e) => onOtpChange(e.target.value)}
                placeholder="Enter OTP"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onVerify}
                disabled={verifying}
              >
                {verifying ? 'Verifying...' : 'Verify OTP'}
              </Button>
              {otpError && <p className="text-sm text-red-500">{otpError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ContactVerificationSectionProps {
  otp: OtpSender;
  formErrors: FormErrors;
  otpInput: OtpInput;
  setOtpInput: Dispatch<SetStateAction<OtpInput>>;
  email: string;
  contactNumber: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  onEmailVerified: () => void;
  onPhoneVerified: () => void;
}

export function ContactVerificationSection({
  otp,
  formErrors,
  otpInput,
  setOtpInput,
  email,
  contactNumber,
  isEmailVerified,
  isPhoneVerified,
  onEmailVerified,
  onPhoneVerified
}: ContactVerificationSectionProps) {
  return (
    <div className="rounded-md border p-3 bg-gray-50 text-sm text-gray-700 space-y-3">
      <OtpChannel
        label="Email verification:"
        sendLabel="Verify Email"
        verified={isEmailVerified}
        sending={otp.otpSending.email}
        sent={otp.otpSent.email}
        verifying={otp.otpVerifying.email}
        cooldown={otp.otpCooldown.email}
        error={formErrors.email}
        otpError={formErrors.emailOtp}
        otpValue={otpInput.email}
        onOtpChange={(value) => setOtpInput((prev) => ({ ...prev, email: value }))}
        onSend={() => otp.handleSendEmailOtp(email)}
        onVerify={async () => {
          const ok = await otp.handleVerifyEmailOtp(email, otpInput.email, { persist: true });
          if (ok) onEmailVerified();
        }}
      />

      {PHONE_VERIFICATION_ENABLED ? (
        <OtpChannel
          label="Phone OTP verification:"
          sendLabel="Verify Mobile"
          verified={isPhoneVerified}
          sending={otp.otpSending.phone}
          sent={otp.otpSent.phone}
          verifying={otp.otpVerifying.phone}
          cooldown={otp.otpCooldown.phone}
          error={formErrors.phone}
          otpError={formErrors.phoneOtp}
          otpValue={otpInput.phone}
          onOtpChange={(value) => setOtpInput((prev) => ({ ...prev, phone: value }))}
          onSend={() => otp.handleSendPhoneOtp(contactNumber)}
          onVerify={async () => {
            const ok = await otp.handleVerifyPhoneOtp(contactNumber, otpInput.phone);
            if (ok) onPhoneVerified();
          }}
        />
      ) : null}
    </div>
  );
}
