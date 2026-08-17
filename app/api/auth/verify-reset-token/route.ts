import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cleanupPasswordResetStores, getPasswordResetToken } from '../forgot-password/route';

const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = verifyTokenSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid token format' }, { status: 400 });
    }

    const { token } = validationResult.data;

    cleanupPasswordResetStores();

    const tokenData = getPasswordResetToken(token);

    if (!tokenData) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    if (tokenData.expires < Date.now()) {
      return NextResponse.json({ error: 'Reset token has expired' }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Token is valid',
      email: tokenData.email,
      success: true,
    });
  } catch (error: unknown) {
    console.error('Verify reset token error:', error);
    return NextResponse.json(
      { error: 'An error occurred while verifying the token' },
      { status: 500 }
    );
  }
}
