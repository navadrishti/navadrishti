import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    if (!getAdminUser(request)) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const currentUsername = process.env.ADMIN_USERNAME || 'admin';

    return NextResponse.json({ 
      currentUsername,
      message: 'Current admin info retrieved'
    });
  } catch (error) {
    console.error('Error reading admin settings:', error);
    return NextResponse.json({ error: 'Failed to read admin info' }, { status: 500 });
  }
}