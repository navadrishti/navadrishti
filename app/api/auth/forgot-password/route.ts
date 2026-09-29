import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '@/lib/db';
import {
  normalizeEmailAddress,
  prepareEmailOtpSession,
  sendEmailOtpWithSupabase,
  verifyEmailOtpWithSupabase,
} from '@/lib/email';
import { issueOneTimeCode } from '@/lib/one-time-codes';
import { limitAttempts, rateLimit, rateLimitedResponse } from '@/lib/rate-limit';

const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RESET_OTP_RESEND_LIMIT = { limit: 1, windowMs: 60 * 1000 };
const GENERIC_SEND_RESPONSE = {
  message: 'If an account with that email exists, we have sent a password reset OTP.',
  success: true,
};

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

async function sendPasswordResetOtp(email: string) {
  try {
    const prepared = await prepareEmailOtpSession(email);
    if (!prepared.ok && prepared.status !== 429) return;

    const sent = await sendEmailOtpWithSupabase(email);
    if (!sent.ok && !isUnknownAuthUserError(sent.error)) {
      console.error('Forgot password OTP send error:', sent.error);
    }
  } catch (error) {
    console.error('Forgot password OTP send error:', error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (typeof body?.otp === 'string' && body.otp.trim()) {
      const validationResult = verifyOtpSchema.safeParse(body);

      if (!validationResult.success) {
        return NextResponse.json(
          { error: validationResult.error.errors[0].message },
          { status: 400 }
        );
      }

      const { email } = validationResult.data;
      const otp = validationResult.data.otp.trim();

      const limited = await limitAttempts(req, 'forgot-password-otp', email);
      if (limited) return limited;

      const verification = await verifyEmailOtpWithSupabase(email, otp);

      if (!verification.ok) {
        return NextResponse.json({ error: verification.error }, { status: 400 });
      }

      const user = await db.users.findByEmail(email);

      if (!user) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      await issueOneTimeCode({
        purpose: 'password_reset',
        subject: normalizeEmailAddress(email),
        code: resetToken,
        userId: user.id,
        ttlMs: PASSWORD_RESET_TOKEN_TTL_MS,
      });

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
        { error: validationResult.error.errors[0].message },
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

    // The lookup and send run after the response so neither its content nor its timing
    // reveals whether the account exists; failures are only logged.
    after(async () => {
      try {
        const user = await db.users.findByEmail(email);
        if (user) await sendPasswordResetOtp(email);
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
