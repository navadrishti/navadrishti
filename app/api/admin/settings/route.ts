import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Check for admin token authentication
    const adminToken = request.cookies.get('admin-token')?.value;
    
    if (!adminToken) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    // Verify admin token
    try {
      const decoded = verifyToken(adminToken);
      if (!decoded || decoded.id !== -1) {
        return NextResponse.json({ error: 'Invalid admin token' }, { status: 401 });
      }
    } catch (error) {
      return NextResponse.json({ error: 'Invalid admin token' }, { status: 401 });
    }

    // Get current admin username
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