import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Clear admin token cookie
    const response = NextResponse.json({ 
      success: true, 
      message: 'Admin logged out successfully' 
    });

    response.cookies.set('admin-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0 // Immediately expire
    });

    return response;
  } catch (error) {
    console.error('Admin logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}