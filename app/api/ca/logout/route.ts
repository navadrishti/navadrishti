import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'CA logged out successfully'
    });

    response.cookies.set('ca-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0
    });

    return response;
  } catch (error) {
    console.error('CA logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}