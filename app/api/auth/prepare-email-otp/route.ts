import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prepareEmailOtpSession } from '@/lib/email';
import { limitAttempts } from '@/lib/rate-limit';

const EMAIL_OTP_PER_IP_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

const prepareEmailOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
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

    const email = validationResult.data.email;
    const limited =
      (await limitAttempts(req, 'prepare-email-otp', email)) ??
      (await limitAttempts(req, 'prepare-email-otp-ip', '', EMAIL_OTP_PER_IP_LIMIT));
    if (limited) return limited;

    const result = await prepareEmailOtpSession(email);

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
