import { NextResponse } from 'next/server';
import { clearAuthTokenCookie } from '@/lib/server-auth';

export async function POST() {
  try {
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
