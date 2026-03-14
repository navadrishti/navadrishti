import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'ID and password required' }, { status: 400 });
    }

    // Get CA console credentials from environment variables
    const caUsername = process.env.CA_USERNAME || 'ca';
    const caPassword = process.env.CA_PASSWORD || 'ca123';

    // Check credentials
    if (username !== caUsername || password !== caPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Generate CA console session token
    const caToken = generateToken({
      id: -2, // Special CA console ID
      email: 'ca@system.local',
      name: 'CA Console User',
      user_type: 'company' as any
    });

    const response = NextResponse.json({
      success: true,
      message: 'CA login successful',
      role: 'ca',
      ca: {
        username: caUsername,
        icai_membership_number: process.env.CA_MEMBERSHIP_NUMBER || '123456'
      }
    });

    response.cookies.set('ca-token', caToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60 // 30 minutes
    });

    return response;
  } catch (error) {
    console.error('CA login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}