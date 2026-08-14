import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getCompanyCAUserIdSet } from '@/lib/company-ca';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!query || query.trim().length < 1) {
      return NextResponse.json({ 
        profiles: [],
        message: 'Query must be at least 1 character long'
      }, { status: 400 });
    }

    const searchTerm = query.trim().toLowerCase();
    const profileSelect = `
        id,
        name,
        email,
        user_type,
        profile_image,
        verification_status,
        city,
        state_province,
        location
      `;

    // Fetch prefix matches first, then broader matches so short queries (e.g. "s")
    // still surface relevant names before applying the response limit.
    const fetchLimit = Math.max(limit * 12, 48);
    const [{ data: prefixProfiles, error: prefixError }, { data: containsProfiles, error: containsError }] =
      await Promise.all([
        supabase
          .from('users')
          .select(profileSelect)
          .ilike('name', `${searchTerm}%`)
          .limit(fetchLimit),
        supabase
          .from('users')
          .select(profileSelect)
          .ilike('name', `%${searchTerm}%`)
          .not('name', 'ilike', `${searchTerm}%`)
          .limit(fetchLimit),
      ]);

    const error = prefixError || containsError;
    const mergedProfiles = [...(prefixProfiles ?? []), ...(containsProfiles ?? [])];
    const uniqueProfiles = Array.from(
      new Map(mergedProfiles.map((profile) => [profile.id, profile])).values()
    );

    if (error) {
      console.error('Profile search error:', error);
      return NextResponse.json({ 
        profiles: [],
        error: 'Search failed'
      }, { status: 500 });
    }

    const companyCAIds = await getCompanyCAUserIdSet(uniqueProfiles.map((profile) => Number(profile.id)));
    const visibleProfiles = uniqueProfiles.filter((profile) => !companyCAIds.has(Number(profile.id)));

    // Sort results by hierarchy: names starting with search term first, then by position of match
    const sortedProfiles = visibleProfiles.sort((a, b) => {
      const nameA = a.name.toLowerCase().trim();
      const nameB = b.name.toLowerCase().trim();
      const searchLower = searchTerm.toLowerCase().trim();
      
      // Find position of search term in each name
      const aIndex = nameA.indexOf(searchLower);
      const bIndex = nameB.indexOf(searchLower);
      
      // Names starting with search term get highest priority (position 0)
      const aStartsWith = aIndex === 0;
      const bStartsWith = bIndex === 0;
      
      // If one starts with search term and other doesn't, prioritize the starter
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
      // Sort by position of match (earlier position = higher priority)
      return aIndex - bIndex;
    });

    // Format the results for frontend (apply response limit after relevance sort)
    const formattedProfiles = sortedProfiles?.slice(0, limit).map(profile => ({
      id: profile.id,
      name: profile.name || 'Unknown User',
      email: profile.email || '',
      user_type: profile.user_type || 'individual',
      profile_image: profile.profile_image,
      verification_status: profile.verification_status || 'unverified',
      location: profile.location || 
                (profile.city && profile.state_province 
                  ? `${profile.city}, ${profile.state_province}`
                  : profile.city || profile.state_province || null)
    })) || [];

    // Sort by verification status and name
    formattedProfiles.sort((a, b) => {
      // Verified profiles first
      if (a.verification_status === 'verified' && b.verification_status !== 'verified') return -1;
      if (b.verification_status === 'verified' && a.verification_status !== 'verified') return 1;
      
      // Then sort by name
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      profiles: formattedProfiles,
      total: formattedProfiles.length,
      query: searchTerm
    }, { status: 200 });

  } catch (error) {
    console.error('Profile search API error:', error);
    return NextResponse.json({ 
      profiles: [],
      error: 'Internal server error'
    }, { status: 500 });
  }
}