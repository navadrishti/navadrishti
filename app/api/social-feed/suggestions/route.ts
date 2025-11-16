// API route for location-based user suggestions
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '5')
    const maxDistance = parseInt(searchParams.get('maxDistance') || '50')
    
    // Get user ID from auth token if available
    let userId = null
    let userLocation = null
    const authHeader = request.headers.get('authorization')
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      try {
        const decoded = await verifyToken(token)
        userId = decoded.userId
      } catch {
        // Continue without user ID if token is invalid
      }
    }

    const { supabase } = await import('@/lib/db')
    let suggestions = []

    if (userId) {
      // Get user's location first
      const { data: userData } = await supabase
        .from('users')
        .select('city, state, latitude, longitude')
        .eq('id', userId)
        .single()

      if (userData) {
        userLocation = userData

        // Try location-based search using stored procedure if it exists
        try {
          const { data: locationSuggestions, error } = await supabase
            .rpc('get_location_based_suggestions', {
              p_user_id: userId,
              p_max_distance_km: maxDistance,
              p_limit: limit
            })

          if (!error && locationSuggestions?.length > 0) {
            suggestions = locationSuggestions.map((user: any) => ({
              id: user.suggested_user_id,
              name: user.name,
              role: getUserRole(user.user_type),
              user_type: user.user_type,
              profile_image: user.profile_image,
              city: user.city,
              state: user.state,
              distance_km: user.distance_km,
              verification_status: user.verification_status
            }))
          }
        } catch (rpcError) {
          console.log('RPC function not available, using manual query')
        }

        // Fallback: Manual location-based query
        if (suggestions.length === 0) {
          let query = supabase
            .from('users')
            .select('id, name, user_type, profile_image, city, state, latitude, longitude, verification_status')
            .neq('id', userId)
            .eq('verification_status', 'verified')
            .limit(limit)

          // City-based search
          if (userData.city) {
            query = query.eq('city', userData.city)
          } else if (userData.state) {
            query = query.eq('state', userData.state)
          }

          const { data, error } = await query.order('created_at', { ascending: false })

          if (!error && data) {
            suggestions = data.map(user => ({
              id: user.id,
              name: user.name,
              role: getUserRole(user.user_type),
              user_type: user.user_type,
              profile_image: user.profile_image,
              city: user.city,
              state: user.state,
              distance_km: 0, // Will calculate if needed
              verification_status: user.verification_status
            }))
          }
        }
      }

      // If still no suggestions, get general suggestions
      if (suggestions.length === 0) {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, user_type, profile_image, city, state, verification_status')
          .neq('id', userId)
          .eq('verification_status', 'verified')
          .limit(limit)
          .order('created_at', { ascending: false })

        if (!error && data) {
          suggestions = data.map(user => ({
            id: user.id,
            name: user.name,
            role: getUserRole(user.user_type),
            user_type: user.user_type,
            profile_image: user.profile_image,
            city: user.city,
            state: user.state,
            verification_status: user.verification_status
          }))
        }
      }
    } else {
      // For logged-out users, show diverse verified entities
      const { data, error } = await supabase
        .from('users')
        .select('id, name, user_type, profile_image, city, state, verification_status')
        .eq('verification_status', 'verified')
        .limit(limit)
        .order('created_at', { ascending: false })

      if (!error && data) {
        suggestions = data.map(user => ({
          id: user.id,
          name: user.name,
          role: getUserRole(user.user_type),
          user_type: user.user_type,
          profile_image: user.profile_image,
          city: user.city,
          state: user.state,
          verification_status: user.verification_status
        }))
      }
    }

    return NextResponse.json({
      success: true,
      data: suggestions,
      count: suggestions.length,
      metadata: {
        userId,
        userLocation: userLocation ? {
          city: userLocation.city,
          state: userLocation.state
        } : null,
        isLocationBased: !!userLocation?.city
      }
    })
  } catch (error) {
    console.error('Error fetching user suggestions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user suggestions' },
      { status: 500 }
    )
  }
}

function getUserRole(userType: string) {
  switch (userType) {
    case 'ngo': return 'NGO Representative'
    case 'company': return 'Corporate Partner'
    case 'individual': return 'Community Professional'
    default: return 'Community Member'
  }
}