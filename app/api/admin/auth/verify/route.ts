// Admin Session Verification API
// Verify admin session and return user data

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin-db';

export async function GET(request: NextRequest) {
  try {
    // Get session token from cookie
    const sessionToken = request.cookies.get('admin_session')?.value;
    console.log('Session verification - token found:', !!sessionToken);
    console.log('All cookies:', request.cookies.getAll().map(c => ({ name: c.name, hasValue: !!c.value })));

    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: 'No session token' },
        { status: 401 }
      );
    }

    // Verify session
    const { data: session, error } = await adminDb.adminSessions.findByToken(sessionToken);
    console.log('Session lookup result:', { found: !!session, error: error?.message });

    if (error || !session) {
      return NextResponse.json(
        { success: false, error: 'Invalid session', details: error?.message },
        { status: 401 }
      );
    }

    // Check if admin user is still active
    if (!session.admin_users.is_active) {
      return NextResponse.json(
        { success: false, error: 'Account deactivated' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      adminUser: {
        id: session.admin_users.id,
        email: session.admin_users.email,
        name: session.admin_users.name,
        role: session.admin_users.role,
        permissions: typeof session.admin_users.permissions === 'string' 
          ? JSON.parse(session.admin_users.permissions) 
          : session.admin_users.permissions || [],
        lastLogin: session.admin_users.last_login
      }
    });

  } catch (error) {
    console.error('Session verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}