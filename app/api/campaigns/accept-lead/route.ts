import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth'

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    assertUserType(user, ['ngo'])

    const body = await request.json()
    const campaignId = body?.campaign_id
    if (!campaignId) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })

    // fetch campaign
    const { data: campaign, error: fetchErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (fetchErr || !campaign) {
      console.error('Failed to fetch campaign for accept:', fetchErr)
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const impact = campaign.impact_metrics && typeof campaign.impact_metrics === 'object' ? campaign.impact_metrics : {}
    const selectedLead = Number(impact.selected_lead_ngo_id || 0)
    if (selectedLead !== user.id) {
      return NextResponse.json({ error: 'You are not the selected lead NGO for this campaign' }, { status: 403 })
    }

    // determine volunteers required
    const required = Number(impact.volunteer_requirement ?? campaign.volunteers_needed ?? 0)

    // fetch NGO capacity
    const { data: ngoUser, error: ngoErr } = await supabase
      .from('users')
      .select('id, ngo_volunteer_capacity')
      .eq('id', user.id)
      .single()

    const capacity = ngoErr || !ngoUser ? 0 : Number(ngoUser.ngo_volunteer_capacity || 0)

    const gap = Math.max(0, required - capacity)

    const newImpact = {
      ...impact,
      lead_ngo_accepted_at: new Date().toISOString(),
      volunteer_gap: gap,
      volunteer_capacity: capacity,
      lead_ngo_accepted: true,
    }

    const { data: updated, error: updateErr } = await supabase
      .from('campaigns')
      .update({ status: 'active', impact_metrics: newImpact })
      .eq('id', campaignId)
      .select('*')
      .single()

    if (updateErr) {
      console.error('Failed to update campaign on accept:', updateErr)
      return NextResponse.json({ error: 'Failed to accept campaign' }, { status: 500 })
    }

    // audit log
    await supabase.from('csr_audit_log').insert({
      entity_type: 'campaign',
      entity_id: campaignId,
      event_type: 'lead_ngo_accepted',
      event_hash: `lead_ngo_accepted:${campaignId}:${user.id}:${Date.now()}`,
      event_payload: { ngo_id: user.id, gap, capacity },
      created_by: user.id
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    console.error('Campaign accept error:', e)
    return NextResponse.json({ error: 'Failed to accept lead role' }, { status: 500 })
  }
}
