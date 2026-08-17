import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { normalizeEmailAddress, prepareEmailOtpSession, verifyEmailOtpWithSupabase } from '@/lib/email';

const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

type PasswordResetTokenRecord = {
  email: string;
  userId: number;
  expires: number;
};

const passwordResetTokens = new Map<string, PasswordResetTokenRecord>();

const sendOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const verifyOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().min(4, 'OTP is required'),
});

const cleanupExpiredResetTokens = () => {
  const now = Date.now();
  for (const [token, record] of passwordResetTokens.entries()) {
    if (record.expires <= now) {
      passwordResetTokens.delete(token);
    }
  }
};

const createPasswordResetToken = (email: string, userId: number) => {
  const resetToken = crypto.randomBytes(32).toString('hex');
  passwordResetTokens.set(resetToken, {
    email: normalizeEmailAddress(email),
    userId,
    expires: Date.now() + PASSWORD_RESET_TOKEN_TTL_MS,
  });
  return resetToken;
};

export const getPasswordResetToken = (token: string) => passwordResetTokens.get(token);

export const deletePasswordResetToken = (token: string) => {
  passwordResetTokens.delete(token);
};

export { cleanupExpiredResetTokens as cleanupPasswordResetStores };

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

      const email = normalizeEmailAddress(validationResult.data.email);
      const otp = validationResult.data.otp.trim();

      cleanupExpiredResetTokens();

      const user = await db.users.findByEmail(email);

      if (!user) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      const verification = await verifyEmailOtpWithSupabase(email, otp);

      if (!verification.ok) {
        return NextResponse.json({ error: verification.error }, { status: 400 });
      }

      const resetToken = createPasswordResetToken(email, user.id);

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

    const email = normalizeEmailAddress(validationResult.data.email);
    const user = await db.users.findByEmail(email);

    if (user) {
      const prepared = await prepareEmailOtpSession(email);
      if (!prepared.ok) {
        return NextResponse.json({ error: prepared.error }, { status: prepared.status });
      }
    }

    return NextResponse.json({
      message: 'If an account with that email exists, we have sent a password reset OTP.',
      success: true,
    });
  } catch (error: unknown) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}
