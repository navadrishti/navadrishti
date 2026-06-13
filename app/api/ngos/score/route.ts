import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { getAuthUserFromRequest } from '@/lib/server-auth'
import { scoreNgosForCampaign, type CampaignMatchInput } from '@/lib/csr-agent/recommendation-utils'

type ScoreRequest = CampaignMatchInput & {
  limit?: number
}

function getUserIdFromRequest(request: NextRequest): number | null {
  try {
    return getAuthUserFromRequest(request).id
  } catch {
    const cookieToken = request.cookies.get('token')?.value
    if (!cookieToken) return null
    const user = verifyToken(cookieToken)
    return user?.id ?? null
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request)
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = (await request.json()) as ScoreRequest
    const limit = Math.min(Math.max(Number(body.limit || 10), 1), 30)

    const { data: ngos, error } = await supabase
      .from('users')
      .select('id, name, email, city, state_province, profile_data, ngo_volunteer_capacity, verification_status')
      .eq('user_type', 'ngo')
      .order('verification_status', { ascending: true })
      .limit(300)

    if (error) {
      console.error('Failed to fetch NGOs for scoring:', error)
      return NextResponse.json({ error: 'Failed to fetch ngos' }, { status: 500 })
    }

    const scored = scoreNgosForCampaign(ngos || [], body, limit)

    if (scored.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'No NGOs are registered on the platform yet.',
      })
    }

    return NextResponse.json({ success: true, data: scored })
  } catch (e) {
    console.error('NGO scoring error:', e)
    return NextResponse.json({ error: 'Failed to score ngos' }, { status: 500 })
  }
}
