// Admin Login API
// Production-ready admin authentication endpoint

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { adminDb } from '@/lib/admin-db';
import { serialize } from 'cookie';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find admin user
    const { data: adminUser, error: findError } = await adminDb.adminUsers.findByEmail(email);

    if (findError || !adminUser) {
      // Add delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 1000));
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, adminUser.password_hash);

    if (!passwordMatch) {
      // Add delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 1000));
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Get client info
    const clientIP = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || '';

    // Create session
    const { error: sessionError } = await adminDb.adminSessions.create({
      admin_user_id: adminUser.id,
      session_token: sessionToken,
      ip_address: clientIP,
      user_agent: userAgent,
      expires_at: expiresAt.toISOString()
    });

    if (sessionError) {
      console.error('Session creation error:', sessionError);
      return NextResponse.json(
        { success: false, error: 'Failed to create session' },
        { status: 500 }
      );
    }

    // Update last login
    await adminDb.adminUsers.updateLastLogin(adminUser.id);

    // Log the login
    await adminDb.auditLogs.create({
      admin_user_id: adminUser.id,
      admin_email: adminUser.email,
      action: 'login',
      resource_type: 'admin_session',
      ip_address: clientIP,
      user_agent: userAgent
    });

    // Create response with httpOnly cookie
    const response = NextResponse.json({
      success: true,
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
        permissions: typeof adminUser.permissions === 'string' 
          ? JSON.parse(adminUser.permissions) 
          : adminUser.permissions || [],
        lastLogin: adminUser.last_login
      }
    });

    // Set httpOnly cookie
    const cookie = serialize('admin_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/'
    });

    response.headers.set('Set-Cookie', cookie);

    return response;

  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}