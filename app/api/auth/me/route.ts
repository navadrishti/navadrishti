import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import { withAuth, UserData } from '@/lib/auth';
import { stripDedicatedProfileData } from '@/lib/profile-storage';

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
    
    const sanitizedProfileData = stripDedicatedProfileData(
      freshUserData.user_type,
      freshUserData.profile_data || {}
    );

    return NextResponse.json({
      user: {
        id: freshUserData.id,
        email: freshUserData.email,
        name: freshUserData.name,
        user_type: freshUserData.user_type,
        phone: freshUserData.phone || '',
        bio: freshUserData.bio || '',
        email_verified: freshUserData.email_verified || false,
        phone_verified: freshUserData.phone_verified || false,
        email_verified_at: freshUserData.email_verified_at,
        phone_verified_at: freshUserData.phone_verified_at,
        verification_status: verificationStatus,
        verification_details: verificationDetails,
        profile_image: freshUserData.profile_image || null,
        city: freshUserData.city,
        state_province: freshUserData.state_province,
        pincode: freshUserData.pincode,
        country: freshUserData.country,
        industry: freshUserData.industry,
        website: freshUserData.website,
        company_size: freshUserData.company_size,
        ngo_size: freshUserData.ngo_size,
        ngo_registration_type: freshUserData.ngo_registration_type,
        ngo_registration_number: freshUserData.ngo_registration_number,
        ngo_registration_date: freshUserData.ngo_registration_date,
        ngo_pan_number: freshUserData.ngo_pan_number,
        ngo_12a_number: freshUserData.ngo_12a_number,
        ngo_80g_number: freshUserData.ngo_80g_number,
        ngo_csr1_registration_number: freshUserData.ngo_csr1_registration_number,
        ngo_fcra_applicable: freshUserData.ngo_fcra_applicable,
        ngo_fcra_number: freshUserData.ngo_fcra_number,
        ngo_bank_details: freshUserData.ngo_bank_details,
        ngo_sectors_schedule_vii: freshUserData.ngo_sectors_schedule_vii,
        ngo_past_projects: freshUserData.ngo_past_projects,
        ngo_geographic_coverage: freshUserData.ngo_geographic_coverage,
        ngo_execution_capacity: freshUserData.ngo_execution_capacity,
        ngo_team_strength: freshUserData.ngo_team_strength,
        company_cin_number: freshUserData.company_cin_number,
        company_pan_number: freshUserData.company_pan_number,
        company_net_worth: freshUserData.company_net_worth,
        company_turnover: freshUserData.company_turnover,
        company_net_profit: freshUserData.company_net_profit,
        company_csr_vision: freshUserData.company_csr_vision,
        company_focus_areas_schedule_vii: freshUserData.company_focus_areas_schedule_vii,
        company_implementation_model: freshUserData.company_implementation_model,
        company_governance_mechanism: freshUserData.company_governance_mechanism,
        created_at: freshUserData.created_at,
        profile_data: sanitizedProfileData,
        // For backward compatibility, also extract profile fields
        profile: sanitizedProfileData
      }
    });
    
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
  }
}

// Apply authentication middleware
export const GET = withAuth(handler);