import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';
import { isCompanyCAUser } from '@/lib/company-ca-visibility';
import { stripDedicatedProfileData } from '@/lib/profile-storage';

interface RouteParams {
  params: Promise<{ userId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await params;
    const parsedUserId = Number.parseInt(userId, 10);

    if (Number.isNaN(parsedUserId)) {
      return Response.json({
        success: false,
        error: 'Profile not found'
      }, { status: 404 });
    }

    if (await isCompanyCAUser(parsedUserId)) {
      return Response.json({
        success: false,
        error: 'Profile not found'
      }, { status: 404 });
    }

    // Get user profile data with location and profile image
    const { data: userResult, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        user_type,
        location,
        profile_image,
        city,
        state_province,
        pincode,
        country,
        email_verified,
        phone_verified,
        profile_data,
        industry,
        website,
        company_size,
        ngo_size,
        ngo_registration_type,
        ngo_registration_number,
        ngo_registration_date,
        ngo_pan_number,
        ngo_12a_number,
        ngo_80g_number,
        ngo_csr1_registration_number,
        ngo_fcra_applicable,
        ngo_fcra_number,
        ngo_bank_details,
        ngo_sectors_schedule_vii,
        ngo_past_projects,
        ngo_geographic_coverage,
        ngo_execution_capacity,
        ngo_team_strength,
        company_cin_number,
        company_pan_number,
        company_net_worth,
        company_turnover,
        company_net_profit,
        company_csr_vision,
        company_focus_areas_schedule_vii,
        company_implementation_model,
        company_governance_mechanism,
        created_at
      `)
      .eq('id', parsedUserId)
      .single();

    if (userError || !userResult) {
      return Response.json({ 
        success: false,
        error: 'Profile not found' 
      }, { status: 404 });
    }

    // Get verification status based on user type - check database only
    let verificationStatus = 'unverified';
    let verificationDetails = null;

    if (userResult.user_type === 'individual') {
      const { data: verification } = await supabase
        .from('individual_verifications')
        .select('verification_status, aadhaar_verified, pan_verified, verification_date, aadhaar_number, pan_number, aadhaar_verification_date, pan_verification_date')
        .eq('user_id', parsedUserId)
        .single();
      
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = verification;
      }
    } else if (userResult.user_type === 'company') {
      const { data: verification } = await supabase
        .from('company_verifications')
        .select('verification_status, company_name, verification_date, registration_number, gst_number')
        .eq('user_id', parsedUserId)
        .single();
      
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = verification;
      }
    } else if (userResult.user_type === 'ngo') {
      const { data: verification } = await supabase
        .from('ngo_verifications')
        .select('verification_status, ngo_name, verification_date, registration_number, registration_type, fcra_number')
        .eq('user_id', parsedUserId)
        .single();
      
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = verification;
      }
    }

    // Helper function to detect fake/mock location data
    const isFakeLocation = (location: string): boolean => {
      if (!location) return false;
      
      const fakeLocations = [
        'new york',
        'ny',
        'new york, ny',
        'sample location',
        'test location',
        'dummy location',
        'fake location',
        'mock location',
        'placeholder location'
      ];
      
      return fakeLocations.some(fake => 
        location.toLowerCase().includes(fake)
      );
    };

    const sanitizedProfileData = stripDedicatedProfileData(
      userResult.user_type,
      userResult.profile_data || {}
    );

    // Format the response with available profile data
    const formattedProfile = {
      ...userResult,
      // Set default values for fields that might not exist in the database yet
      phone: null,
      address: (userResult.location && !isFakeLocation(userResult.location)) ? userResult.location : null,
      bio: null,
      skills: [],
      interests: [],
      website: null,
      portfolio: [],
      // Include only non-dedicated attributes in profile_data.
      profile_data: sanitizedProfileData,
      verification_status: verificationStatus,
      verification_details: verificationDetails
    };

    return Response.json({
      success: true,
      profile: formattedProfile
    });

  } catch (error: any) {
    console.error('Profile fetch error:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ 
      success: false,
      error: 'Failed to fetch profile',
      details: error.message 
    }, { status: 500 });
  }
}