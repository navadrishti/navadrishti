import { NextResponse } from 'next/server';
import { clearEvidenceVerificationTokenCookie } from '@/lib/server-auth';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  clearEvidenceVerificationTokenCookie(response);
  return response;
}
