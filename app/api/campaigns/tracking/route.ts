import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { assertUserType, authErrorResponse, getAuthUserFromRequest } from '@/lib/server-auth'
import { buildCampaignTracking } from '@/lib/campaign-tracking'

const MAX_CAMPAIGNS = 50

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['company', 'ngo'])

    const ownerColumn = user.user_type === 'company' ? 'company_id' : 'lead_ngo_user_id'
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, status, start_date, end_date, budget_inr, impact_metrics, lead_ngo_user_id')
      .eq(ownerColumn, user.id)
      .order('created_at', { ascending: false })
      .limit(MAX_CAMPAIGNS)
    if (error) throw error

    const tracking = await buildCampaignTracking(campaigns || [])
    return NextResponse.json({ success: true, data: Object.fromEntries(tracking) })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Campaign tracking error:', error)
    return NextResponse.json({ error: 'Failed to load campaign tracking' }, { status: 500 })
  }
}
