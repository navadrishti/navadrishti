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
    const { industry, company_size, company_website } = body

    // Check if company details record exists
    const { data: existingCompany, error: checkError } = await supabase
      .from('company_details')
      .select('id')
      .eq('user_id', userId)

    if (checkError) {
      console.error('Error checking existing company:', checkError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (existingCompany && existingCompany.length > 0) {
      // Update existing company details
      const { error: updateError } = await supabase
        .from('company_details')
        .update({
          industry: industry || null,
          company_size: company_size || null,
          website: company_website || null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)

      if (updateError) {
        console.error('Error updating company:', updateError)
        return NextResponse.json({ error: 'Failed to update company details' }, { status: 500 })
      }
    } else {
      // Create new company details record
      const { error: insertError } = await supabase
        .from('company_details')
        .insert({
          user_id: userId,
          industry: industry || null,
          company_size: company_size || null,
          website: company_website || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (insertError) {
        console.error('Error creating company:', insertError)
        return NextResponse.json({ error: 'Failed to create company details' }, { status: 500 })
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Company details saved successfully' 
    })

  } catch (error) {
    console.error('Company save error:', error)
    return NextResponse.json(
      { error: 'Failed to save company details' },
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

    // Get company data
    const { data: company, error: fetchError } = await supabase
      .from('company_details')
      .select('*')
      .eq('user_id', userId)

    if (fetchError) {
      console.error('Error fetching company:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch company details' }, { status: 500 })
    }

    if (!company || company.length === 0) {
      return NextResponse.json({ 
        company: null,
        message: 'No company details found' 
      })
    }

    const companyData = company[0]

    return NextResponse.json({
      success: true,
      company: {
        id: companyData.id,
        industry: companyData.industry,
        company_size: companyData.company_size,
        website: companyData.website,
        createdAt: companyData.created_at,
        updatedAt: companyData.updated_at
      }
    })

  } catch (error) {
    console.error('Company fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch company details' },
      { status: 500 }
    )
  }
}