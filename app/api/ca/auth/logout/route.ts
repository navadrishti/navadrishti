import { NextRequest, NextResponse } from 'next/server';
import { PLATFORM_CA_COOKIE } from '@/lib/platform-ca-auth';

export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({ success: true, message: 'CA logged out successfully' });

    // Clear both legacy and current CA tokens to ensure verification fails after logout
    response.cookies.set('ca-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });

    response.cookies.set(PLATFORM_CA_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('CA logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
