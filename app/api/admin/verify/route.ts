import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const adminToken = request.cookies.get('admin-token')?.value;

    if (!adminToken) {
      return NextResponse.json({ error: 'No admin token found' }, { status: 401 });
    }

    try {
      const decoded = verifyToken(adminToken);

      if (!decoded || decoded.id !== -1) {
        return NextResponse.json({ error: 'Invalid admin token' }, { status: 401 });
      }

      const username = process.env.ADMIN_USERNAME || 'admin';

      return NextResponse.json({
        success: true,
        admin: {
          username,
          display_name: 'Administrator',
          role: 'admin',
        },
      });
    } catch {
      return NextResponse.json({ error: 'Invalid admin token' }, { status: 401 });
    }
  } catch (error) {
    console.error('Admin verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
