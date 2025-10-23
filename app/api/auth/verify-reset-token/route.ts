import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resetTokens } from '../forgot-password/route';

// Validation schema
const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required')
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = verifyTokenSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        error: 'Invalid token format' 
      }, { status: 400 });
    }
    
    const { token } = validationResult.data;
    
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
    
    // Token is valid
    return NextResponse.json({
      message: 'Token is valid',
      email: tokenData.email,
      success: true
    });
    
  } catch (error: any) {
    console.error('Verify reset token error:', error);
    return NextResponse.json({ 
      error: 'An error occurred while verifying the token' 
    }, { status: 500 });
  }
}