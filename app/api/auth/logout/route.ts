import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_TOKEN_COOKIE, clearAuthTokenCookie } from '@/lib/server-auth';

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(AUTH_TOKEN_COOKIE);

    const response = NextResponse.json({
      message: 'Logged out successfully',
      success: true,
    });

    clearAuthTokenCookie(response);

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
