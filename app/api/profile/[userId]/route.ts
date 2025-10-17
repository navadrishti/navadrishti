import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';

interface RouteParams {
  params: Promise<{ userId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await params;
    console.log('Profile API called with userId:', userId);

    // Get user profile data - only query columns that exist
    const { data: userResult, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        user_type,
        location,
        created_at
      `)
      .eq('id', parseInt(userId))
      .single();

    console.log('User query result:', userResult);
    console.log('User query error:', userError);

    if (userError || !userResult) {
      console.log('User not found, error:', userError);
      return Response.json({ 
        success: false,
        error: 'Profile not found' 
      }, { status: 404 });
    }

    // Get user's marketplace statistics - only count real/meaningful listings
    const { data: listingsData, error: listingsError } = await supabase
      .from('marketplace_items')
      .select('id, status, title, description, price')
      .eq('seller_id', parseInt(userId));

    console.log('Listings query result:', listingsData);

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
      profile_image: null,
      verification_status: null,
      total_listings: totalListings,
      total_sold: totalSold,
      rating_average: ratingAverage,
      rating_count: ratingCount
    };

    console.log('Formatted profile response:', formattedProfile);

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