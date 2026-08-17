import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import {
  cleanupPasswordResetStores,
  deletePasswordResetToken,
  getPasswordResetToken,
  normalizeResetEmail,
} from '@/lib/password-reset';

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  resetToken: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = resetPasswordSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 }
      );
    }

    const { resetToken, password } = validationResult.data;
    const email = normalizeResetEmail(validationResult.data.email);

    cleanupPasswordResetStores();

    const tokenData = getPasswordResetToken(resetToken);

    if (!tokenData) {
      return NextResponse.json(
        { error: 'Invalid or expired reset session. Please verify your OTP again.' },
        { status: 400 }
      );
    }

    if (tokenData.expires < Date.now()) {
      deletePasswordResetToken(resetToken);
      return NextResponse.json(
        { error: 'Reset session has expired. Please verify your OTP again.' },
        { status: 400 }
      );
    }

    if (tokenData.email !== email) {
      return NextResponse.json(
        { error: 'Invalid reset session for this email' },
        { status: 400 }
      );
    }

    const user = await db.users.findByEmail(email);

    if (!user || user.id !== tokenData.userId) {
      deletePasswordResetToken(resetToken);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const hashedPassword = await hashPassword(password);

    await db.users.update(user.id, {
      password: hashedPassword,
      updated_at: new Date().toISOString(),
    });

    deletePasswordResetToken(resetToken);

    return NextResponse.json({
      message: 'Password has been successfully reset',
      success: true,
    });
  } catch (error: unknown) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'An error occurred while resetting your password' },
      { status: 500 }
    );
  }
}
