import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { executeQuery } from '@/lib/db'

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

    const userId = decoded.userId

    const body = await request.json()
    const { description, certifications, projectPhotos } = body

    // Validate input
    if (!description && !certifications && (!projectPhotos || projectPhotos.length === 0)) {
      return NextResponse.json({ error: 'At least one portfolio field is required' }, { status: 400 })
    }

    // Check if portfolio record exists for this user
    const existingPortfolio = await executeQuery({
      query: 'SELECT id FROM user_portfolios WHERE user_id = ?',
      values: [userId]
    }) as any[]

    if (existingPortfolio.length > 0) {
      // Update existing portfolio
      await executeQuery({
        query: `
          UPDATE user_portfolios 
          SET description = ?, certifications = ?, project_photos = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `,
        values: [
          description || null,
          certifications || null,
          JSON.stringify(projectPhotos || []),
          userId
        ]
      })
    } else {
      // Create new portfolio record
      await executeQuery({
        query: `
          INSERT INTO user_portfolios (user_id, description, certifications, project_photos, created_at, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        values: [
          userId,
          description || null,
          certifications || null,
          JSON.stringify(projectPhotos || [])
        ]
      })
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

    const userId = decoded.userId

    // Get portfolio data
    const portfolio = await executeQuery({
      query: 'SELECT * FROM user_portfolios WHERE user_id = ?',
      values: [userId]
    }) as any[]

    if (portfolio.length === 0) {
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