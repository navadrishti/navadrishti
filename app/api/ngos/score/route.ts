import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { authErrorResponse, getAuthUserFromRequest } from '@/lib/server-auth'
import { scoreNgosForCampaign, type CampaignMatchInput } from '@/lib/csr-agent/recommendation-utils'

type ScoreRequest = CampaignMatchInput & {
  limit?: number
}

export async function POST(request: NextRequest) {
  try {
    await getAuthUserFromRequest(request)

    const body = (await request.json()) as ScoreRequest
    const limit = Math.min(Math.max(Number(body.limit || 10), 1), 30)

    if (!String(body.end_date || '').trim()) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'Campaign end date is required before CSR-1 coverage can be scored for lead NGO suggestions.',
      })
    }

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
        message:
          'No CSR-1 tagged NGOs cover this campaign end date yet. CSR-1 must remain valid through the full campaign timeline.',
      })
    }

    return NextResponse.json({ success: true, data: scored })
  } catch (e) {
    const auth = authErrorResponse(e)
    if (auth) return auth
    console.error('NGO scoring error:', e)
    return NextResponse.json({ error: 'Failed to score ngos' }, { status: 500 })
  }
}
