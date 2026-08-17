import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyEmailOtpWithSupabase } from '@/lib/email-otp-verify';
import {
  cleanupPasswordResetStores,
  createPasswordResetToken,
  normalizeResetEmail,
} from '@/lib/password-reset';

const verifyResetOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().min(4, 'OTP is required'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = verifyResetOtpSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 }
      );
    }

    const email = normalizeResetEmail(validationResult.data.email);
    const otp = validationResult.data.otp.trim();

    cleanupPasswordResetStores();

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
  } catch (error: unknown) {
    console.error('Verify reset OTP error:', error);
    return NextResponse.json(
      { error: 'An error occurred while verifying the OTP' },
      { status: 400 }
    );
  }
}
