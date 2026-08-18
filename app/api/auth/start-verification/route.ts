import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ 
        error: 'Phone number is required' 
      }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization')?.split(' ')[1];

    const emailResponse = await fetch(`${process.env.APP_URL}/api/auth/send-verification-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authHeader}`
      }
    });

    const phoneResponse = await fetch(`${process.env.APP_URL}/api/auth/send-phone-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authHeader}`
      },
      body: JSON.stringify({ phone })
    });

    return NextResponse.json({
      message: 'Verification requests sent',
      emailSent: emailResponse.ok,
      phoneSent: phoneResponse.ok,
    });

  } catch (error) {
    console.error('Start verification error:', error);
    return NextResponse.json({ 
      error: 'Failed to start verification process' 
    }, { status: 500 });
  }
});