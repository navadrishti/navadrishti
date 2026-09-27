import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  if (!getAdminUser(request)) {
    return NextResponse.json({ error: 'Invalid admin token' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    admin: {
      username: process.env.ADMIN_USERNAME || 'admin',
      display_name: 'Administrator',
      role: 'admin',
    },
  });
}
