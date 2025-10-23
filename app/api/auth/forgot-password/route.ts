import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { sendEmail, generatePasswordResetEmail } from '@/lib/email';

// Validation schema
const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address')
});

// Store password reset tokens temporarily (in production, use Redis or database)
const resetTokens = new Map<string, { email: string; expires: number }>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = forgotPasswordSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        error: validationResult.error.errors[0].message 
      }, { status: 400 });
    }
    
    const { email } = validationResult.data;
    
    // Check if user exists
    const user = await db.users.findByEmail(email);
    
    // Always return success to prevent email enumeration attacks
    // but only send email if user exists
    if (user) {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + 3600000; // 1 hour from now
      
      // Store token (in production, store in database with user_id)
      resetTokens.set(resetToken, { email, expires });
      
      // Generate password reset URL
      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
      
      console.log(`Password reset requested for ${email}`);
      console.log(`Reset URL: ${resetUrl}`);
      
      try {
        // Send password reset email
        const emailHtml = generatePasswordResetEmail(resetUrl, email);
        const emailSent = await sendEmail({
          to: email,
          subject: 'Password Reset - Navdrishti',
          html: emailHtml
        });
        
        if (emailSent) {
          console.log(`✅ Password reset email sent to: ${email}`);
        } else {
          console.error(`❌ Failed to send password reset email to: ${email}`);
        }
        
      } catch (emailError) {
        console.error('Failed to send reset email:', emailError);
        // Don't expose email sending errors to prevent information leakage
      }
    } else {
      console.log(`Password reset requested for non-existent email: ${email}`);
    }
    
    // Always return success message to prevent email enumeration
    return NextResponse.json({
      message: 'If an account with that email exists, we have sent a password reset link.',
      success: true
    });
    
  } catch (error: any) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ 
      error: 'An error occurred while processing your request' 
    }, { status: 500 });
  }
}

// Helper function to clean up expired tokens (call this periodically)
export function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of resetTokens.entries()) {
    if (data.expires < now) {
      resetTokens.delete(token);
    }
  }
}

// Export the tokens map for use in other endpoints
export { resetTokens };