import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      console.error('Admin credentials are not configured');
      return NextResponse.json({ error: 'Admin login is not configured' }, { status: 500 });
    }
    if (username !== adminUsername || password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Generate admin-only session token (never a platform user id)
    const adminToken = generateToken({
      id: -1,
      email: 'admin@system.local',
      name: 'Administrator',
      user_type: 'admin' as any,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Admin login successful',
      role: 'admin',
      admin: {
        username: adminUsername,
        display_name: 'Administrator',
      },
    });

    // Clear any stale path-scoped admin cookie, then set the live session cookie.
    response.cookies.set('admin-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: new Date(0),
      maxAge: 0,
      path: '/api/admin',
    });

    response.cookies.set('admin-token', adminToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return response;

  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}