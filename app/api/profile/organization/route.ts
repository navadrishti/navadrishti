import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { supabase } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })
    }

    // Verify the JWT token
    const token = authHeader.substring(7)
    let decoded: any
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const userId = decoded.id

    const body = await request.json()
    const { registration_number, founded_year, focus_areas, organization_website } = body

    // Check if organization details record exists
    const { data: existingOrg, error: checkError } = await supabase
      .from('organization_details')
      .select('id')
      .eq('user_id', userId)

    if (checkError) {
      console.error('Error checking existing organization:', checkError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (existingOrg && existingOrg.length > 0) {
      // Update existing organization details
      const { error: updateError } = await supabase
        .from('organization_details')
        .update({
          registration_number: registration_number || null,
          founded_year: founded_year || null,
          focus_areas: focus_areas || null,
          website: organization_website || null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)

      if (updateError) {
        console.error('Error updating organization:', updateError)
        return NextResponse.json({ error: 'Failed to update organization details' }, { status: 500 })
      }
    } else {
      // Create new organization details record
      const { error: insertError } = await supabase
        .from('organization_details')
        .insert({
          user_id: userId,
          registration_number: registration_number || null,
          founded_year: founded_year || null,
          focus_areas: focus_areas || null,
          website: organization_website || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (insertError) {
        console.error('Error creating organization:', insertError)
        return NextResponse.json({ error: 'Failed to create organization details' }, { status: 500 })
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Organization details saved successfully' 
    })

  } catch (error) {
    console.error('Organization save error:', error)
    return NextResponse.json(
      { error: 'Failed to save organization details' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })
    }

    // Verify the JWT token
    const token = authHeader.substring(7)
    let decoded: any
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const userId = decoded.id

    // Get organization data
    const { data: organization, error: fetchError } = await supabase
      .from('organization_details')
      .select('*')
      .eq('user_id', userId)

    if (fetchError) {
      console.error('Error fetching organization:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch organization details' }, { status: 500 })
    }

    if (!organization || organization.length === 0) {
      return NextResponse.json({ 
        organization: null,
        message: 'No organization details found' 
      })
    }

    const orgData = organization[0]

    return NextResponse.json({
      success: true,
      organization: {
        id: orgData.id,
        registration_number: orgData.registration_number,
        founded_year: orgData.founded_year,
        focus_areas: orgData.focus_areas,
        website: orgData.website,
        createdAt: orgData.created_at,
        updatedAt: orgData.updated_at
      }
    })

  } catch (error) {
    console.error('Organization fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch organization details' },
      { status: 500 }
    )
  }
}