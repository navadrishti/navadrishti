import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // Create response with cleared cookies
    const response = NextResponse.json({ 
      message: 'Logged out successfully',
      success: true 
    });

    // Clear all authentication cookies
    response.cookies.set('token', '', {
      path: '/',
      expires: new Date(0),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    response.cookies.set('user', '', {
      path: '/',
      expires: new Date(0),
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}