import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import {
  canEchoLocalPasswordResetOtp,
  deliverLocalPasswordResetOtp,
  generateLocalPasswordResetOtp,
  isLocalPasswordResetOtpAllowedForEmail,
  verifyLocalPasswordResetOtp,
} from '@/lib/auth/password-reset-otp';
import { db } from '@/lib/db';
import {
  normalizeEmailAddress,
  prepareEmailOtpSession,
  sendEmailOtpWithSupabase,
  verifyEmailOtpWithSupabase,
} from '@/lib/email';
import { issueOneTimeCode } from '@/lib/one-time-codes';
import { limitAttempts, rateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { zodIssuesToUserMessage } from '@/lib/user-facing-error';

const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RESET_OTP_RESEND_LIMIT = { limit: 1, windowMs: 60 * 1000 };
const GENERIC_SEND_RESPONSE = {
  message: 'If an account with that email exists, we have sent a password reset OTP.',
  success: true,
};
const INVALID_OTP_RESPONSE = { error: 'Invalid OTP' };

const sendOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
});

const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  otp: z.string().min(4, 'OTP is required'),
});

const isUnknownAuthUserError = (error: { message?: string; code?: string }) => {
  const code = String(error.code || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();
  return (
    code === 'otp_disabled' ||
    code === 'user_not_found' ||
    message.includes('signups not allowed') ||
    message.includes('user not found')
  );
};

/** Real accounts only — never falls back to local OTP for arbitrary Supabase failures. */
async function sendSupabasePasswordResetOtp(email: string) {
  try {
    const prepared = await prepareEmailOtpSession(email);
    if (!prepared.ok && prepared.status !== 429) return;

    const sent = await sendEmailOtpWithSupabase(email);
    if (sent.ok) return;

    if (!isUnknownAuthUserError(sent.error)) {
      console.error('Forgot password OTP send error:', sent.error);
    }
  } catch (error) {
    console.error('Forgot password OTP send error:', error);
  }
}

async function issueResetTokenForUser(email: string, userId: number) {
  const resetToken = crypto.randomBytes(32).toString('hex');
  await issueOneTimeCode({
    purpose: 'password_reset',
    subject: normalizeEmailAddress(email),
    code: resetToken,
    userId,
    ttlMs: PASSWORD_RESET_TOKEN_TTL_MS,
  });
  return resetToken;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (typeof body?.otp === 'string' && body.otp.trim()) {
      const validationResult = verifyOtpSchema.safeParse(body);

      if (!validationResult.success) {
        return NextResponse.json(
          { error: zodIssuesToUserMessage(validationResult.error.issues) },
          { status: 400 }
        );
      }

      const { email } = validationResult.data;
      const otp = validationResult.data.otp.trim();

      const limited = await limitAttempts(req, 'forgot-password-otp', email);
      if (limited) return limited;

      if (isLocalPasswordResetOtpAllowedForEmail(email)) {
        const local = await verifyLocalPasswordResetOtp(email, otp);
        if (local.status !== 'ok') {
          return NextResponse.json(INVALID_OTP_RESPONSE, { status: 400 });
        }

        const user = await db.users.findByEmail(email);
        if (!user || (local.userId != null && user.id !== local.userId)) {
          return NextResponse.json(INVALID_OTP_RESPONSE, { status: 400 });
        }

        const resetToken = await issueResetTokenForUser(email, user.id);
        return NextResponse.json({
          success: true,
          message: 'OTP verified successfully',
          resetToken,
          accountName: user.name || user.email,
          email,
        });
      }

      const verification = await verifyEmailOtpWithSupabase(email, otp);
      if (!verification.ok) {
        return NextResponse.json({ error: verification.error }, { status: 400 });
      }

      const user = await db.users.findByEmail(email);
      if (!user) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      const resetToken = await issueResetTokenForUser(email, user.id);
      return NextResponse.json({
        success: true,
        message: 'OTP verified successfully',
        resetToken,
        accountName: user.name || user.email,
        email,
      });
    }

    const validationResult = sendOtpSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: zodIssuesToUserMessage(validationResult.error.issues) },
        { status: 400 }
      );
    }

    const { email } = validationResult.data;

    const limited = await limitAttempts(req, 'forgot-password', email);
    if (limited) return limited;

    // Throttled by address before the account lookup so a 429 says nothing about whether the account exists.
    const resend = await rateLimit(`forgot-password-resend:${email}`, RESET_OTP_RESEND_LIMIT);
    if (!resend.allowed) {
      return rateLimitedResponse(
        resend.retryAfterSeconds,
        `Please wait ${resend.retryAfterSeconds}s before requesting another email OTP`
      );
    }

    // Explicit E2E/dev local OTP for configured test domains only.
    if (isLocalPasswordResetOtpAllowedForEmail(email)) {
      const user = await db.users.findByEmail(email);
      const echo = canEchoLocalPasswordResetOtp();
      let devOtp: string | undefined;

      if (user) {
        const delivered = await deliverLocalPasswordResetOtp(email, user.id);
        if (!delivered.ok && delivered.retryAfterSeconds) {
          return rateLimitedResponse(
            delivered.retryAfterSeconds,
            `Please wait ${delivered.retryAfterSeconds}s before requesting another email OTP`
          );
        }
        if (echo && delivered.ok && delivered.otp) {
          devOtp = delivered.otp;
        }
      } else if (echo) {
        // Same response shape for unknown addresses — decoy is not stored and cannot verify.
        devOtp = generateLocalPasswordResetOtp();
      }

      return NextResponse.json(
        echo && devOtp ? { ...GENERIC_SEND_RESPONSE, devOtp } : GENERIC_SEND_RESPONSE
      );
    }

    // Normal path: Supabase email OTP for real accounts. Lookup/send after respond.
    after(async () => {
      try {
        const user = await db.users.findByEmail(email);
        if (user) await sendSupabasePasswordResetOtp(email);
      } catch (error) {
        console.error('Forgot password OTP send error:', error);
      }
    });

    return NextResponse.json(GENERIC_SEND_RESPONSE);
  } catch (error: unknown) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}
