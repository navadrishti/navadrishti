import { createClient } from '@supabase/supabase-js';

const otpTypes: Array<'email' | 'signup'> = ['email', 'signup'];

export async function verifyEmailOtpWithSupabase(
  email: string,
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  let verificationError: Error | null = null;

  for (const otpType of otpTypes) {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: otpType,
    });

    if (!error) {
      return { ok: true };
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

  const message = (verificationError?.message || 'Invalid email OTP').replace(/\btoken\b/gi, 'OTP');
  return { ok: false, error: message };
}
