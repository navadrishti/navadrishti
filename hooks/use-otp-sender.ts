import { useState, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase';

type FormErrors = Record<string, string>;

interface OtpState {
  email: boolean;
  phone: boolean;
}

const emailRegex = /^\S+@\S+\.\S+$/;
const phoneRegex = /^[+]?[1-9]\d{1,14}$/;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

export function useOtpSender(setFormErrors: Dispatch<SetStateAction<FormErrors>>) {
  const [otpSending, setOtpSending] = useState<OtpState>({ email: false, phone: false });
  const [otpSent, setOtpSent] = useState<OtpState>({ email: false, phone: false });
  const [otpVerifying, setOtpVerifying] = useState<OtpState>({ email: false, phone: false });
  const [otpVerified, setOtpVerified] = useState<OtpState>({ email: false, phone: false });
  const [otpCooldown, setOtpCooldown] = useState<{ email: number; phone: number }>({ email: 0, phone: 0 });

  useEffect(() => {
    const hasCooldown = otpCooldown.email > 0 || otpCooldown.phone > 0;

    if (!hasCooldown) {
      return;
    }

    const timer = setInterval(() => {
      setOtpCooldown(prev => ({
        email: Math.max(0, prev.email - 1),
        phone: Math.max(0, prev.phone - 1)
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [otpCooldown.email, otpCooldown.phone]);

  const startCooldown = (channel: 'email' | 'phone') => {
    setOtpCooldown(prev => ({ ...prev, [channel]: OTP_RESEND_COOLDOWN_SECONDS }));
  };

  const resetEmailOtpState = useCallback(() => {
    setOtpSent(prev => ({ ...prev, email: false }));
    setOtpVerified(prev => ({ ...prev, email: false }));
    setOtpSending(prev => ({ ...prev, email: false }));
    setOtpVerifying(prev => ({ ...prev, email: false }));
    setFormErrors(prev => {
      const nextErrors = { ...prev };
      delete nextErrors.emailOtp;
      return nextErrors;
    });
  }, [setFormErrors]);

  const handleSendEmailOtp = async (emailInput: string) => {
    const email = emailInput.trim();

    if (otpCooldown.email > 0) {
      toast.error(`Please wait ${otpCooldown.email}s before requesting another email OTP`);
      return;
    }

    if (!email) {
      setFormErrors(prev => ({ ...prev, email: 'Email is required' }));
      return;
    }

    if (!emailRegex.test(email)) {
      setFormErrors(prev => ({ ...prev, email: 'Email is invalid' }));
      return;
    }

    try {
      setOtpSending(prev => ({ ...prev, email: true }));

      const prepareResponse = await fetch('/api/auth/prepare-email-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const prepareData = await prepareResponse.json();
      if (!prepareResponse.ok) {
        toast.error(prepareData.error || 'Failed to prepare email OTP');
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false
        }
      });

      if (error) {
        toast.error(error.message || 'Failed to send email OTP');
        return;
      }

      setOtpSent(prev => ({ ...prev, email: true }));
      setOtpVerified(prev => ({ ...prev, email: false }));
      startCooldown('email');
      toast.success('Email OTP sent successfully');
    } catch {
      toast.error('Failed to send email OTP. Please try again.');
    } finally {
      setOtpSending(prev => ({ ...prev, email: false }));
    }
  };

  const handleVerifyEmailOtp = async (emailInput: string, otpInput: string) => {
    const email = emailInput.trim();
    const otp = otpInput.trim();

    if (!email) {
      setFormErrors(prev => ({ ...prev, email: 'Email is required' }));
      return false;
    }

    if (!emailRegex.test(email)) {
      setFormErrors(prev => ({ ...prev, email: 'Email is invalid' }));
      return false;
    }

    if (!otp) {
      setFormErrors(prev => ({ ...prev, emailOtp: 'Email OTP is required' }));
      return false;
    }

    try {
      setOtpVerifying(prev => ({ ...prev, email: true }));
      const supabase = createClient();
      const otpTypes: Array<'email' | 'signup'> = ['email', 'signup'];
      let verificationError: Error | null = null;

      for (const otpType of otpTypes) {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token: otp,
          type: otpType
        });

        if (!error) {
          verificationError = null;
          break;
        }

        verificationError = error;

        const normalizedMessage = (error.message || '').toLowerCase();
        const shouldTryFallback =
          otpType === 'email' &&
          (normalizedMessage.includes('invalid') ||
            normalizedMessage.includes('expired') ||
            normalizedMessage.includes('token') ||
            normalizedMessage.includes('otp') ||
            normalizedMessage.includes('email link'));

        if (!shouldTryFallback) {
          break;
        }
      }

      if (verificationError) {
        const otpErrorMessage = (verificationError.message || 'Invalid email OTP').replace(/\btoken\b/gi, 'OTP');
        setOtpVerified(prev => ({ ...prev, email: false }));
        setFormErrors(prev => ({ ...prev, emailOtp: otpErrorMessage }));
        toast.error(otpErrorMessage);
        return false;
      }

      setFormErrors(prev => {
        const nextErrors = { ...prev };
        delete nextErrors.emailOtp;
        return nextErrors;
      });
      setOtpVerified(prev => ({ ...prev, email: true }));
      toast.success('Email OTP verified successfully');
      return true;
    } catch {
      setOtpVerified(prev => ({ ...prev, email: false }));
      toast.error('Failed to verify email OTP. Please try again.');
      return false;
    } finally {
      setOtpVerifying(prev => ({ ...prev, email: false }));
    }
  };

  const handleSendPhoneOtp = async (phoneInput: string) => {
    const phone = phoneInput.trim().replace(/\s+/g, '');

    if (otpCooldown.phone > 0) {
      toast.error(`Please wait ${otpCooldown.phone}s before requesting another phone OTP`);
      return;
    }

    if (!phone) {
      setFormErrors(prev => ({ ...prev, phone: 'Phone number is required' }));
      return;
    }

    if (!phoneRegex.test(phone)) {
      setFormErrors(prev => ({ ...prev, phone: 'Please enter a valid phone number' }));
      return;
    }

    try {
      setOtpSending(prev => ({ ...prev, phone: true }));

      const response = await fetch('/api/auth/verify-phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone })
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Failed to send phone OTP');
        return;
      }

      setOtpSent(prev => ({ ...prev, phone: true }));
      startCooldown('phone');
      toast.success(data.message || 'Phone OTP sent successfully');
    } catch {
      toast.error('Failed to send phone OTP. Please try again.');
    } finally {
      setOtpSending(prev => ({ ...prev, phone: false }));
    }
  };

  return {
    otpSending,
    otpSent,
    otpCooldown,
    otpVerifying,
    otpVerified,
    handleSendEmailOtp,
    handleVerifyEmailOtp,
    handleSendPhoneOtp,
    resetEmailOtpState
  };
}
