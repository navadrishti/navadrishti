import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prepareEmailOtpSession } from '@/lib/email';

const prepareEmailOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = prepareEmailOtpSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0]?.message || 'Invalid email address' },
        { status: 400 }
      );
    }

    const result = await prepareEmailOtpSession(validationResult.data.email);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      prepared: true,
      message: 'Email OTP session prepared',
    });
  } catch (error) {
    console.error('Prepare email OTP unexpected error:', error);
    return NextResponse.json({ error: 'Failed to prepare email OTP session' }, { status: 500 });
  }
}
