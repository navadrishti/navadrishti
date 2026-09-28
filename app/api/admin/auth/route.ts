import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { generateAdminToken } from '@/lib/auth';
import { setAdminTokenCookie } from '@/lib/server-auth';
import { limitAttempts } from '@/lib/rate-limit';

// Hashing first gives equal-length buffers, so neither the comparison nor its length check leaks the secret's size.
const safeEqual = (a: string, b: string) =>
  crypto.timingSafeEqual(
    crypto.createHash('sha256').update(a).digest(),
    crypto.createHash('sha256').update(b).digest()
  );

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

    const limited = await limitAttempts(request, 'admin-login', String(username));
    if (limited) return limited;

    const usernameMatches = safeEqual(String(username), adminUsername);
    const passwordMatches = safeEqual(String(password), adminPassword);
    if (!usernameMatches || !passwordMatches) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const adminToken = generateAdminToken();

    const response = NextResponse.json({
      success: true,
      message: 'Admin login successful',
      role: 'admin',
      admin: {
        username: adminUsername,
        display_name: 'Administrator',
      },
    });

    setAdminTokenCookie(response, adminToken);

    return response;

  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
