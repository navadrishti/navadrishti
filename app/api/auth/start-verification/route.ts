import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/db';

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const user = (req as any).user;
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ 
        error: 'Phone number is required' 
      }, { status: 400 });
    }

    // Send verification email
    const emailResponse = await fetch(`${process.env.APP_URL}/api/auth/send-verification-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${req.headers.get('authorization')?.split(' ')[1]}`
      }
    });

    // Send phone OTP
    const phoneResponse = await fetch(`${process.env.APP_URL}/api/auth/send-phone-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.headers.get('authorization')?.split(' ')[1]}`
      },
      body: JSON.stringify({ phone })
    });

    const emailData = await emailResponse.json();
    const phoneData = await phoneResponse.json();

    return NextResponse.json({
      message: 'Verification requests sent',
      emailSent: emailResponse.ok,
      phoneSent: phoneResponse.ok,
      ...(process.env.NODE_ENV === 'development' && {
        emailToken: emailData.token,
        phoneOTP: phoneData.otp
      })
    });

  } catch (error) {
    console.error('Start verification error:', error);
    return NextResponse.json({ 
      error: 'Failed to start verification process' 
    }, { status: 500 });
  }
});