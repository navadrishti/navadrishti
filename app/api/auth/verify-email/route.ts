import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ 
        error: 'Verification token is required' 
      }, { status: 400 });
    }

    // Find verification record
    const { data: verification, error: verificationError } = await supabase
      .from('email_verifications')
      .select('user_id, expires_at')
      .eq('token', token)
      .single();

    if (verificationError || !verification) {
      return NextResponse.json({ 
        error: 'Invalid verification token' 
      }, { status: 400 });
    }

    // Check if token has expired
    const now = new Date();
    const expiresAt = new Date(verification.expires_at);
    
    if (now > expiresAt) {
      return NextResponse.json({ 
        error: 'Verification token has expired' 
      }, { status: 400 });
    }

    // Update user email verification status
    const { error: updateError } = await supabase
      .from('users')
      .update({
        email_verified: true,
        email_verified_at: new Date().toISOString()
      })
      .eq('id', verification.user_id);

    if (updateError) {
      console.error('Error updating user verification status:', updateError);
      return NextResponse.json({ 
        error: 'Failed to verify email' 
      }, { status: 500 });
    }

    // Delete used verification token
    await supabase
      .from('email_verifications')
      .delete()
      .eq('token', token);

    return NextResponse.json({ 
      message: 'Email verified successfully',
      verified: true 
    });

  } catch (error) {
    console.error('Verify email error:', error);
    return NextResponse.json({ 
      error: 'Failed to verify email' 
    }, { status: 500 });
  }
}