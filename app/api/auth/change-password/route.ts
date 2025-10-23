import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, comparePassword, verifyToken } from '@/lib/auth';

// Validation schema
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
});

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = payload.id;
    
    const body = await req.json();
    const validationResult = changePasswordSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        error: validationResult.error.errors[0].message 
      }, { status: 400 });
    }
    
    const { currentPassword, newPassword } = validationResult.data;
    
    // Find the user
    const user = await db.users.findById(userId);
    
    if (!user) {
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
    
    if (!isCurrentPasswordValid) {
      return NextResponse.json({ 
        error: 'Current password is incorrect' 
      }, { status: 400 });
    }
    
    // Check if new password is different from current password
    const isSamePassword = await comparePassword(newPassword, user.password);
    
    if (isSamePassword) {
      return NextResponse.json({ 
        error: 'New password must be different from current password' 
      }, { status: 400 });
    }
    
    // Hash the new password
    const hashedNewPassword = await hashPassword(newPassword);
    
    // Update user's password
    await db.users.update(userId, {
      password: hashedNewPassword,
      updated_at: new Date().toISOString()
    });
    
    console.log(`✅ Password changed successfully for user: ${user.email}`);
    
    return NextResponse.json({
      message: 'Password has been successfully changed',
      success: true
    });
    
  } catch (error: any) {
    console.error('Change password error:', error);
    return NextResponse.json({ 
      error: 'An error occurred while changing your password' 
    }, { status: 500 });
  }
}