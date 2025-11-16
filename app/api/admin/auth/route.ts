import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    // Get admin credentials from environment variables
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    console.log('Admin auth attempt:', { username, adminUsername }); // Debug log
    
    // Check credentials
    if (username !== adminUsername || password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Generate admin session token
    const adminToken = generateToken({
      id: -1, // Special admin ID
      email: 'admin@system.local',
      name: 'System Administrator',
      user_type: 'admin' as any
    });

    // Set admin token in cookie
    const response = NextResponse.json({ 
      success: true, 
      message: 'Admin login successful',
      role: 'admin',
      admin: {
        username: adminUsername
      }
    });

    response.cookies.set('admin-token', adminToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60 // 30 minutes only
    });

    return response;

  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}