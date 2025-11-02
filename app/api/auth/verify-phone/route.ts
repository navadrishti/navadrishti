import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/db';

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const user = (req as any).user;
    const { phone, otp } = await req.json();

    if (!phone || !otp) {
      return NextResponse.json({ 
        error: 'Phone number and OTP are required' 
      }, { status: 400 });
    }

    // Find OTP record
    const { data: verification, error: verificationError } = await supabase
      .from('phone_verifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('phone', phone)
      .eq('otp', otp)
      .single();

    if (verificationError || !verification) {
      return NextResponse.json({ 
        error: 'Invalid OTP' 
      }, { status: 400 });
    }

    // Check if OTP has expired
    const now = new Date();
    const expiresAt = new Date(verification.expires_at);
    
    if (now > expiresAt) {
      return NextResponse.json({ 
        error: 'OTP has expired' 
      }, { status: 400 });
    }

    // Update user phone verification status
    const { error: updateError } = await supabase
      .from('users')
      .update({
        phone: phone,
        phone_verified: true,
        phone_verified_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating user phone verification status:', updateError);
      return NextResponse.json({ 
        error: 'Failed to verify phone' 
      }, { status: 500 });
    }

    // Delete used OTP
    await supabase
      .from('phone_verifications')
      .delete()
      .eq('user_id', user.id)
      .eq('phone', phone);

    return NextResponse.json({ 
      message: 'Phone verified successfully',
      verified: true 
    });

  } catch (error) {
    console.error('Verify phone error:', error);
    return NextResponse.json({ 
      error: 'Failed to verify phone' 
    }, { status: 500 });
  }
});