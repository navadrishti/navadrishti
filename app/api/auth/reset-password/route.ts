import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { resetTokens } from '../forgot-password/route';

// Validation schema
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = resetPasswordSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        error: validationResult.error.errors[0].message 
      }, { status: 400 });
    }
    
    const { token, password } = validationResult.data;
    
    // Check if token exists and is not expired
    const tokenData = resetTokens.get(token);
    
    if (!tokenData) {
      return NextResponse.json({ 
        error: 'Invalid or expired reset token' 
      }, { status: 400 });
    }
    
    // Check if token is expired
    if (tokenData.expires < Date.now()) {
      // Clean up expired token
      resetTokens.delete(token);
      return NextResponse.json({ 
        error: 'Reset token has expired' 
      }, { status: 400 });
    }
    
    const { email } = tokenData;
    
    // Find the user
    const user = await db.users.findByEmail(email);
    
    if (!user) {
      // Clean up token since user doesn't exist
      resetTokens.delete(token);
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Hash the new password
    const hashedPassword = await hashPassword(password);
    
    // Update user's password
    await db.users.update(user.id, {
      password: hashedPassword,
      updated_at: new Date().toISOString()
    });
    
    // Clean up the used token
    resetTokens.delete(token);
    
    console.log(`✅ Password reset successful for user: ${email}`);
    
    return NextResponse.json({
      message: 'Password has been successfully reset',
      success: true
    });
    
  } catch (error: any) {
    console.error('Reset password error:', error);
    return NextResponse.json({ 
      error: 'An error occurred while resetting your password' 
    }, { status: 500 });
  }
}