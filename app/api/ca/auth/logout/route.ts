import { NextResponse } from 'next/server';
import { clearPlatformCaTokenCookie } from '@/lib/server-auth';

export async function POST() {
  try {
    const response = NextResponse.json({ success: true, message: 'CA logged out successfully' });

    clearPlatformCaTokenCookie(response);

    return response;
  } catch (error) {
    console.error('CA logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
