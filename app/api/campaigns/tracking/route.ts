import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db/client'
import { assertUserType, authErrorResponse, getAuthUserFromRequest } from '@/lib/server-auth'
import { buildCampaignTracking } from '@/lib/campaign-tracking'

const MAX_TRACKED_CAMPAIGNS = 50

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    assertUserType(user, ['company', 'ngo'])

    const ownerColumn = user.user_type === 'company' ? 'company_id' : 'lead_ngo_user_id'
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, status, start_date, end_date, budget_inr, impact_metrics, lead_ngo_user_id')
      .eq(ownerColumn, user.id)
      .order('created_at', { ascending: false })
      .limit(MAX_TRACKED_CAMPAIGNS)
    if (error) throw error

    let authorizedCampaigns = campaigns || []
    if (user.user_type === 'ngo' && authorizedCampaigns.length > 0) {
      const { data: projects, error: projectError } = await supabase
        .from('csr_projects')
        .select('id, campaign_id, ngo_user_id')
        .in('campaign_id', authorizedCampaigns.map((campaign) => campaign.id))
      if (projectError) throw projectError
      authorizedCampaigns = authorizedCampaigns.filter((campaign) => {
        const linked = (projects || []).filter((project) => project.campaign_id === campaign.id)
        return linked.length > 0 && linked.every((project) => project.ngo_user_id === user.id)
      })
    }
    const tracking = await buildCampaignTracking(authorizedCampaigns)
    return NextResponse.json({ success: true, data: Object.fromEntries(tracking) })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Campaign tracking error:', error)
    return NextResponse.json({ error: 'Failed to load campaign tracking' }, { status: 500 })
  }
}
