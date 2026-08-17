import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { prepareEmailOtpSession, normalizeEmailAddress } from '@/lib/email-otp';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = forgotPasswordSchema.safeParse(body);

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
