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

    const userId = decoded.id // Changed from decoded.userId to decoded.id

    const body = await request.json()
    const { description, certifications, projectPhotos } = body

    // Validate input
    if (!description && !certifications && (!projectPhotos || projectPhotos.length === 0)) {
      return NextResponse.json({ error: 'At least one portfolio field is required' }, { status: 400 })
    }

    // Check if portfolio record exists for this user
    const { data: existingPortfolio, error: checkError } = await supabase
      .from('user_portfolios')
      .select('id')
      .eq('user_id', userId)

    if (checkError) {
      console.error('Error checking existing portfolio:', checkError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (existingPortfolio && existingPortfolio.length > 0) {
      // Update existing portfolio
      const { error: updateError } = await supabase
        .from('user_portfolios')
        .update({
          description: description || null,
          certifications: certifications || null,
          project_photos: JSON.stringify(projectPhotos || []),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)

      if (updateError) {
        console.error('Error updating portfolio:', updateError)
        return NextResponse.json({ error: 'Failed to update portfolio' }, { status: 500 })
      }
    } else {
      // Create new portfolio record
      const { error: insertError } = await supabase
        .from('user_portfolios')
        .insert({
          user_id: userId,
          description: description || null,
          certifications: certifications || null,
          project_photos: JSON.stringify(projectPhotos || []),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (insertError) {
        console.error('Error creating portfolio:', insertError)
        return NextResponse.json({ error: 'Failed to create portfolio' }, { status: 500 })
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Portfolio saved successfully' 
    })

  } catch (error) {
    console.error('Portfolio save error:', error)
    return NextResponse.json(
      { error: 'Failed to save portfolio' },
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

    const userId = decoded.id // Changed from decoded.userId to decoded.id

    // Get portfolio data
    const { data: portfolio, error: fetchError } = await supabase
      .from('user_portfolios')
      .select('*')
      .eq('user_id', userId)

    if (fetchError) {
      console.error('Error fetching portfolio:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 })
    }

    if (!portfolio || portfolio.length === 0) {
      return NextResponse.json({ 
        portfolio: null,
        message: 'No portfolio found' 
      })
    }

    const portfolioData = portfolio[0]
    
    // Parse project photos JSON
    let projectPhotos = []
    if (portfolioData.project_photos) {
      try {
        projectPhotos = JSON.parse(portfolioData.project_photos)
      } catch (e) {
        console.error('Error parsing project photos:', e)
      }
    }

    return NextResponse.json({
      success: true,
      portfolio: {
        id: portfolioData.id,
        description: portfolioData.description,
        certifications: portfolioData.certifications,
        projectPhotos: projectPhotos,
        createdAt: portfolioData.created_at,
        updatedAt: portfolioData.updated_at
      }
    })

  } catch (error) {
    console.error('Portfolio fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch portfolio' },
      { status: 500 }
    )
  }
}