// DigiLocker OAuth callback handler
import { NextRequest, NextResponse } from 'next/server';
import { DigiLockerService } from '@/lib/digilocker';
import { supabase } from '@/lib/db';

const digiLocker = new DigiLockerService();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(`${process.env.FRONTEND_URL}/verification?error=${error}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${process.env.FRONTEND_URL}/verification?error=missing_parameters`);
    }

    // Exchange code for token
    const tokenData = await digiLocker.exchangeCodeForToken(code, state);
    
    // Store the token for later use
    await supabase
      .from('individual_verifications')
      .update({ digilocker_token: tokenData.accessToken })
      .eq('user_id', tokenData.userId);

    // Fetch document data based on document type
    if (tokenData.documentType === 'aadhaar') {
      const aadhaarData = await digiLocker.fetchAadhaarData(tokenData.accessToken);
      
      // Update verification record with Aadhaar data
      await supabase
        .from('individual_verifications')
        .update({
          aadhaar_number: aadhaarData.aadhaarNumber,
          aadhaar_name: aadhaarData.name,
          aadhaar_dob: aadhaarData.dateOfBirth,
          aadhaar_address: JSON.stringify(aadhaarData.address),
          aadhaar_verified: true,
          aadhaar_verification_date: new Date().toISOString()
        })
        .eq('user_id', tokenData.userId);

    } else if (tokenData.documentType === 'pan') {
      const panData = await digiLocker.fetchPANData(tokenData.accessToken);
      
      // Update verification record with PAN data
      await supabase
        .from('individual_verifications')
        .update({
          pan_number: panData.panNumber,
          pan_name: panData.name,
          pan_father_name: panData.fatherName,
          pan_verified: true,
          pan_verification_date: new Date().toISOString()
        })
        .eq('user_id', tokenData.userId);
    }

    // Check if verification is complete
    const { data: verification, error: verificationError } = await supabase
      .from('individual_verifications')
      .select('aadhaar_verified, pan_verified')
      .eq('user_id', tokenData.userId)
      .single();

    if (!verificationError && verification && verification.aadhaar_verified && verification.pan_verified) {
      // Update user verification status
      await supabase
        .from('individual_verifications')
        .update({ verification_status: 'verified' })
        .eq('user_id', tokenData.userId);

      await supabase
        .from('users')
        .update({
          verification_status: 'verified',
          verified_at: new Date().toISOString(),
          verification_level: 'advanced'
        })
        .eq('id', tokenData.userId);
    }

    // Redirect back to verification page with success
    return NextResponse.redirect(`${process.env.FRONTEND_URL}/verification?success=true&document=${tokenData.documentType}`);

  } catch (error) {
    console.error('DigiLocker callback error:', error);
    return NextResponse.redirect(`${process.env.FRONTEND_URL}/verification?error=callback_failed`);
  }
}