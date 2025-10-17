import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import { withAuth, UserData } from '@/lib/auth';

async function handler(req: NextRequest) {
  try {
    // The user is attached by the withAuth middleware
    const user = (req as any).user as UserData;
    
    // Fetch fresh user data from database including profile_image
    const freshUserData = await db.users.findById(user.id);
    
    if (!freshUserData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get verification status based on user type - check database only
    let verificationStatus = 'unverified';
    let verificationDetails = null;

    if (freshUserData.user_type === 'individual') {
      const { data: verification } = await supabase
        .from('individual_verifications')
        .select('verification_status, aadhaar_verified, pan_verified, verification_date, aadhaar_number, pan_number, aadhaar_verification_date, pan_verification_date')
        .eq('user_id', user.id)
        .single();
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = verification;
      }
    } else if (freshUserData.user_type === 'company') {
      const { data: verification } = await supabase
        .from('company_verifications')
        .select('verification_status, company_name, verification_date, registration_number, gst_number')
        .eq('user_id', user.id)
        .single();
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = verification;
      }
    } else if (freshUserData.user_type === 'ngo') {
      const { data: verification } = await supabase
        .from('ngo_verifications')
        .select('verification_status, ngo_name, verification_date, registration_number, registration_type, fcra_number')
        .eq('user_id', user.id)
        .single();
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = verification;
      }
    }
    
    return NextResponse.json({
      user: {
        id: freshUserData.id,
        email: freshUserData.email,
        name: freshUserData.name,
        user_type: freshUserData.user_type,
        verification_status: verificationStatus,
        verification_details: verificationDetails,
        profile_image: freshUserData.profile_image || null,
        city: freshUserData.city,
        state_province: freshUserData.state_province,
        pincode: freshUserData.pincode,
        country: freshUserData.country
      }
    });
    
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
  }
}

// Apply authentication middleware
export const GET = withAuth(handler);