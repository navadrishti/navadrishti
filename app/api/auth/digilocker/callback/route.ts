// DigiLocker OAuth callback handler
import { NextRequest, NextResponse } from 'next/server';
import { DigiLockerService } from '@/lib/digilocker';
import { executeQuery } from '@/lib/db';

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
    await executeQuery({
      query: `UPDATE individual_verifications 
              SET digilocker_token = ? 
              WHERE user_id = ?`,
      values: [tokenData.accessToken, tokenData.userId]
    });

    // Fetch document data based on document type
    if (tokenData.documentType === 'aadhaar') {
      const aadhaarData = await digiLocker.fetchAadhaarData(tokenData.accessToken);
      
      // Update verification record with Aadhaar data
      await executeQuery({
        query: `UPDATE individual_verifications 
                SET aadhaar_number = ?, aadhaar_name = ?, aadhaar_dob = ?, 
                    aadhaar_address = ?, aadhaar_verified = ?, aadhaar_verification_date = NOW()
                WHERE user_id = ?`,
        values: [
          aadhaarData.aadhaarNumber,
          aadhaarData.name,
          aadhaarData.dateOfBirth,
          JSON.stringify(aadhaarData.address),
          true,
          tokenData.userId
        ]
      });

    } else if (tokenData.documentType === 'pan') {
      const panData = await digiLocker.fetchPANData(tokenData.accessToken);
      
      // Update verification record with PAN data
      await executeQuery({
        query: `UPDATE individual_verifications 
                SET pan_number = ?, pan_name = ?, pan_father_name = ?, 
                    pan_verified = ?, pan_verification_date = NOW()
                WHERE user_id = ?`,
        values: [
          panData.panNumber,
          panData.name,
          panData.fatherName,
          true,
          tokenData.userId
        ]
      });
    }

    // Check if verification is complete
    const verification = await executeQuery({
      query: 'SELECT aadhaar_verified, pan_verified FROM individual_verifications WHERE user_id = ?',
      values: [tokenData.userId]
    }) as any[];

    if (verification.length && verification[0].aadhaar_verified && verification[0].pan_verified) {
      // Update user verification status
      await executeQuery({
        query: `UPDATE individual_verifications 
                SET verification_status = 'verified' 
                WHERE user_id = ?`,
        values: [tokenData.userId]
      });

      await executeQuery({
        query: 'UPDATE users SET verification_status = ?, verified_at = NOW(), verification_level = ? WHERE id = ?',
        values: ['verified', 'advanced', tokenData.userId]
      });
    }

    // Redirect back to verification page with success
    return NextResponse.redirect(`${process.env.FRONTEND_URL}/verification?success=true&document=${tokenData.documentType}`);

  } catch (error) {
    console.error('DigiLocker callback error:', error);
    return NextResponse.redirect(`${process.env.FRONTEND_URL}/verification?error=callback_failed`);
  }
}