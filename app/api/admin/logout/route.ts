import { NextResponse } from 'next/server';
import { clearAdminTokenCookie } from '@/lib/server-auth';

export async function POST() {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'Admin logged out successfully',
    });

    clearAdminTokenCookie(response);

    return response;
  } catch (error) {
    console.error('Admin logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
