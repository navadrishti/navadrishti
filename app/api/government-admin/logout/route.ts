import { NextResponse } from 'next/server';
import { clearGovtAdminTokenCookie } from '@/lib/server-auth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearGovtAdminTokenCookie(response);
  return response;
}
