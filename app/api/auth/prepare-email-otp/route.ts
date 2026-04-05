import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase';

const prepareEmailOtpSchema = z.object({
  email: z.string().email('Invalid email address')
});

const PREPARE_RATE_LIMIT_MS = 60 * 1000;
const prepareRateLimitStore = new Map<string, number>();

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isAlreadyRegisteredError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('already registered') ||
    normalized.includes('already exists') ||
    normalized.includes('duplicate') ||
    normalized.includes('user already registered')
  );
};

const cleanupRateLimitStore = () => {
  const now = Date.now();
  for (const [email, timestamp] of prepareRateLimitStore.entries()) {
    if (now - timestamp > PREPARE_RATE_LIMIT_MS * 2) {
      prepareRateLimitStore.delete(email);
    }
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = prepareEmailOtpSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: validationResult.error.issues[0]?.message || 'Invalid email address' }, { status: 400 });
    }

    const email = normalizeEmail(validationResult.data.email);
    cleanupRateLimitStore();

    const lastPreparedAt = prepareRateLimitStore.get(email);
    if (lastPreparedAt && Date.now() - lastPreparedAt < PREPARE_RATE_LIMIT_MS) {
      const retryAfterSeconds = Math.ceil((PREPARE_RATE_LIMIT_MS - (Date.now() - lastPreparedAt)) / 1000);
      return NextResponse.json({ error: `Please wait ${retryAfterSeconds}s before requesting another email OTP` }, { status: 429 });
    }

    const supabase = createServerClient();

    const { error } = await supabase.auth.admin.createUser({
      email,
      password: crypto.randomBytes(24).toString('base64url'),
      email_confirm: true
    });

    if (error && !isAlreadyRegisteredError(error.message || '')) {
      console.error('Prepare email OTP error:', error);
      return NextResponse.json({ error: 'Failed to prepare email OTP session' }, { status: 500 });
    }

    prepareRateLimitStore.set(email, Date.now());

    return NextResponse.json({
      prepared: true,
      message: 'Email OTP session prepared'
    });
  } catch (error) {
    console.error('Prepare email OTP unexpected error:', error);
    return NextResponse.json({ error: 'Failed to prepare email OTP session' }, { status: 500 });
  }
}