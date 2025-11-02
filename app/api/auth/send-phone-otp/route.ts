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

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes from now

    // Store OTP
    const { error } = await supabase
      .from('phone_verifications')
      .upsert({
        user_id: user.id,
        phone: phone,
        otp: otp,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error storing OTP:', error);
      return NextResponse.json({ 
        error: 'Failed to generate OTP' 
      }, { status: 500 });
    }

    // In production, send actual SMS
    if (process.env.NODE_ENV === 'production' && process.env.MSG91_API_KEY) {
      try {
        // MSG91 SMS Service Implementation
        const smsResponse = await fetch('https://api.msg91.com/api/v5/otp', {
          method: 'POST',
          headers: {
            'authkey': process.env.MSG91_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            template_id: process.env.MSG91_TEMPLATE_ID,
            mobile: phone,
            authkey: process.env.MSG91_API_KEY,
            otp: otp
          })
        });

        const smsData = await smsResponse.json();
        
        if (!smsResponse.ok) {
          console.error('SMS sending failed:', smsData);
          return NextResponse.json({ 
            error: 'Failed to send OTP via SMS' 
          }, { status: 500 });
        }

        console.log('SMS sent successfully to:', phone);
      } catch (smsError) {
        console.error('SMS service error:', smsError);
        return NextResponse.json({ 
          error: 'SMS service unavailable' 
        }, { status: 500 });
      }
    } else {
      // Development mode - just log the OTP
      console.log(`Development: Phone verification OTP for ${phone}: ${otp}`);
    }

    return NextResponse.json({ 
      message: 'OTP sent successfully',
      ...(process.env.NODE_ENV === 'development' && { 
        otp: otp // Only in development
      })
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json({ 
      error: 'Failed to send OTP' 
    }, { status: 500 });
  }
});