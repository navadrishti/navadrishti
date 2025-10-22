// Admin Logout API
// Destroy admin session and clear cookies

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin-db';

export async function POST(request: NextRequest) {
  try {
    // Get session token from cookie
    const sessionToken = request.cookies.get('admin_session')?.value;

    if (sessionToken) {
      // Get session info for audit log
      const { data: session } = await adminDb.adminSessions.findByToken(sessionToken);
      
      // Delete session from database
      await adminDb.adminSessions.deleteByToken(sessionToken);

      // Log the logout
      if (session) {
        const clientIP = request.headers.get('x-forwarded-for') || 
                         request.headers.get('x-real-ip') || 
                         '127.0.0.1';
        const userAgent = request.headers.get('user-agent') || '';

        await adminDb.auditLogs.create({
          admin_user_id: session.admin_users.id,
          admin_email: session.admin_users.email,
          action: 'logout',
          resource_type: 'admin_session',
          ip_address: clientIP,
          user_agent: userAgent
        });
      }
    }

    // Clear cookie
    const response = NextResponse.json({ success: true });
    
    response.headers.set('Set-Cookie', 
      'admin_session=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
    );

    return response;

  } catch (error) {
    console.error('Admin logout error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}