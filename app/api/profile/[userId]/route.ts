import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';

interface RouteParams {
  params: Promise<{ userId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await params;

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
        created_at
      `)
      .eq('id', parseInt(userId))
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
        .eq('user_id', parseInt(userId))
        .single();
      
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = verification;
      }
    } else if (userResult.user_type === 'company') {
      const { data: verification } = await supabase
        .from('company_verifications')
        .select('verification_status, company_name, verification_date, registration_number, gst_number')
        .eq('user_id', parseInt(userId))
        .single();
      
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = verification;
      }
    } else if (userResult.user_type === 'ngo') {
      const { data: verification } = await supabase
        .from('ngo_verifications')
        .select('verification_status, ngo_name, verification_date, registration_number, registration_type, fcra_number')
        .eq('user_id', parseInt(userId))
        .single();
      
      if (verification) {
        verificationStatus = verification.verification_status;
        verificationDetails = verification;
      }
    }

    // Get user's marketplace statistics - only count real/meaningful listings
    const { data: listingsData, error: listingsError } = await supabase
      .from('marketplace_items')
      .select('id, status, title, description, price')
      .eq('seller_id', parseInt(userId));

    // Calculate statistics - filter out test/dummy data
    const realListings = listingsData?.filter(item => 
      item.title && 
      item.description && 
      item.price > 0 &&
      !item.title.toLowerCase().includes('test') &&
      !item.title.toLowerCase().includes('sample') &&
      !item.description.toLowerCase().includes('test')
    ) || [];

    const totalListings = realListings.length;
    const totalSold = realListings.filter(item => item.status === 'sold').length;

    // Get ratings data (if you have a ratings system)
    // For now, we'll set default values
    const ratingAverage = 0;
    const ratingCount = 0;

    // Safe JSON parse function
    const safeJsonParse = (jsonString: any, defaultValue: any) => {
      try {
        if (!jsonString) return defaultValue;
        if (typeof jsonString === 'object') return jsonString;
        return JSON.parse(jsonString);
      } catch (e) {
        return defaultValue;
      }
    };

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
      experience: null,
      verification_status: verificationStatus,
      verification_details: verificationDetails,
      total_listings: totalListings,
      total_sold: totalSold,
      rating_average: ratingAverage,
      rating_count: ratingCount
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