import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '@/lib/auth'

interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

// GET - Fetch users based on type
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '50')
    const verified_only = searchParams.get('verified') === 'true'
    
    // Authenticate user for this request
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let decoded: JWTPayload
    
    try {
      decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    } catch (jwtError) {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
    }

    // Build query
    let query = supabase
      .from('users')
      .select('id, name, email, user_type, location, city, state_province, pincode, verified, profile_image')
      .order('name', { ascending: true })
      .limit(limit)

    // Filter by user type if specified
    if (type && ['individual', 'ngo', 'company'].includes(type)) {
      query = query.eq('user_type', type)
    }

    // Filter by verified status if specified
    if (verified_only) {
      query = query.eq('verified', true)
    }

    // Don't include the requesting user in results
    query = query.neq('id', decoded.id)

    const { data: users, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      users: users || []
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}