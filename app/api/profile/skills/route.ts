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
    const { skills, interests, categories } = body

    // Check if user skills record exists
    const { data: existingSkills, error: checkError } = await supabase
      .from('user_skills')
      .select('id')
      .eq('user_id', userId)

    if (checkError) {
      console.error('Error checking existing skills:', checkError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (existingSkills && existingSkills.length > 0) {
      // Update existing skills
      const { error: updateError } = await supabase
        .from('user_skills')
        .update({
          skills: skills || null,
          interests: interests || null,
          categories: categories || null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)

      if (updateError) {
        console.error('Error updating skills:', updateError)
        return NextResponse.json({ error: 'Failed to update skills' }, { status: 500 })
      }
    } else {
      // Create new skills record
      const { error: insertError } = await supabase
        .from('user_skills')
        .insert({
          user_id: userId,
          skills: skills || null,
          interests: interests || null,
          categories: categories || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (insertError) {
        console.error('Error creating skills:', insertError)
        return NextResponse.json({ error: 'Failed to create skills' }, { status: 500 })
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Skills and interests saved successfully' 
    })

  } catch (error) {
    console.error('Skills save error:', error)
    return NextResponse.json(
      { error: 'Failed to save skills and interests' },
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

    // Get skills data
    const { data: skills, error: fetchError } = await supabase
      .from('user_skills')
      .select('*')
      .eq('user_id', userId)

    if (fetchError) {
      console.error('Error fetching skills:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch skills' }, { status: 500 })
    }

    if (!skills || skills.length === 0) {
      return NextResponse.json({ 
        skills: null,
        message: 'No skills found' 
      })
    }

    const skillsData = skills[0]

    return NextResponse.json({
      success: true,
      skills: {
        id: skillsData.id,
        skills: skillsData.skills,
        interests: skillsData.interests,
        categories: skillsData.categories,
        createdAt: skillsData.created_at,
        updatedAt: skillsData.updated_at
      }
    })

  } catch (error) {
    console.error('Skills fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch skills' },
      { status: 500 }
    )
  }
}