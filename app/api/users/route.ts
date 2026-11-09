import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getTokenClaims } from '@/lib/auth'
import { authErrorResponse } from '@/lib/server-auth'
import { getCompanyCAUserIdSet } from '@/lib/company-ca'
import { fetchUserPaymentHistory } from '@/lib/razorpay-route'
import { fetchCompanyCsrCapabilityFines } from '@/lib/csr-agent/campaign'

// GET - Fetch users based on type
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const view = searchParams.get('view')
    const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit') || '', 10) || 50, 1), 100)
    const verified_only = searchParams.get('verified') === 'true'
    
    // Authenticate user for this request
    const decoded = await getTokenClaims(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (view === 'payment-history') {
      const role = String(searchParams.get('role') || 'sent').toLowerCase() === 'received' ? 'received' : 'sent'
      const historyLimit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 300)

      // Received ledger is beneficiary-scoped (ngo_user_id). Individuals who create
      // capability offers are valid payees; companies rarely have inbound rows.
      const userType = String(decoded.user_type || '').toLowerCase()
      if (role === 'received' && !['ngo', 'individual', 'company'].includes(userType)) {
        return NextResponse.json({ error: 'Received payment history is not available for this account type' }, { status: 403 })
      }

      try {
        const payments = await fetchUserPaymentHistory({
          userId: Number(decoded.id),
          userType: decoded.user_type,
          role,
          limit: historyLimit,
        })

        return NextResponse.json({
          success: true,
          data: payments,
          fines: decoded.user_type === 'company'
            ? await fetchCompanyCsrCapabilityFines(decoded.id)
            : [],
          role,
          total: payments.length,
        })
      } catch (historyError) {
        console.error('Payment history error:', historyError)
        return NextResponse.json({ error: 'Failed to fetch payment history' }, { status: 500 })
      }
    }

    let query = supabase
      .from('users')
      .select('id, name, user_type, location, city, state_province, pincode, verification_status, profile_image')
      .order('name', { ascending: true })
      .limit(limit)

    if (type && ['individual', 'ngo', 'company'].includes(type)) {
      query = query.eq('user_type', type)
    }

    if (verified_only) {
      query = query.eq('verification_status', 'verified')
    }

    // Don't include the requesting user in results
    query = query.neq('id', decoded.id)

    const { data: users, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    const companyCAIds = await getCompanyCAUserIdSet((users || []).map((candidate) => Number(candidate.id)))
    const visibleUsers = (users || []).filter((candidate) => !companyCAIds.has(Number(candidate.id)))

    return NextResponse.json({ 
      success: true,
      users: visibleUsers
    })

  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}