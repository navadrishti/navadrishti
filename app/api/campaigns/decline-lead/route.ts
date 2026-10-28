import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { findAuthUser } from '@/lib/server-auth'
import { getCampaignLeadNgoId, parseLeadNgoInvites } from '@/lib/campaign-volunteer-attendance'
import { parseJsonObject } from '@/lib/utils'
import { redactCampaignForViewer } from '@/lib/campaign-public-view'

const ACTIONABLE_INVITE_STATUSES = new Set([
  'invited',
  'pending',
  'pending_acceptance',
  'awaiting_acceptance',
  'offered',
  'assigned',
])

export async function POST(request: NextRequest) {
  try {
    const user = findAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    if (user.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can decline the lead role' }, { status: 403 })
    }

    const body = await request.json()
    const campaignId = body?.campaign_id
    if (!campaignId) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })

    const { data: campaign, error: fetchErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (fetchErr || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const impact = parseJsonObject(campaign.impact_metrics)
    const selectedLead = getCampaignLeadNgoId(campaign)
    const invites = parseLeadNgoInvites(impact.lead_ngo_invites)
    const inviteForUser = invites.find((invite) => invite.ngo_id === user.id)
    const actionableInvite =
      inviteForUser && ACTIONABLE_INVITE_STATUSES.has(String(inviteForUser.status || '').toLowerCase())

    if (!actionableInvite) {
      return NextResponse.json(
        { error: 'You do not have a pending lead NGO invite for this campaign.' },
        { status: 403 }
      )
    }

    if (impact.lead_ngo_accepted && selectedLead === user.id) {
      return NextResponse.json({ error: 'You already accepted this lead role.' }, { status: 409 })
    }

    const updatedInvites = invites.map((invite) => ({
      ...invite,
      status: invite.ngo_id === user.id ? 'rejected' : invite.status,
    }))

    const { data: updated, error: updateErr } = await supabase
      .from('campaigns')
      .update({
        impact_metrics: {
          ...impact,
          lead_ngo_invites: updatedInvites,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId)
      .select('*')
      .maybeSingle()

    if (updateErr || !updated) {
      console.error('Failed to decline campaign lead invite:', updateErr)
      return NextResponse.json({ error: 'Failed to decline lead role' }, { status: 500 })
    }

    await supabase.from('csr_audit_log').insert({
      entity_type: 'campaign',
      entity_id: campaignId,
      event_type: 'lead_ngo_declined',
      event_hash: `lead_ngo_declined:${campaignId}:${user.id}:${Date.now()}`,
      event_payload: { ngo_id: user.id },
      created_by: user.id,
    })

    return NextResponse.json({ success: true, data: redactCampaignForViewer(updated, user.id) })
  } catch (error) {
    console.error('Decline campaign lead error:', error)
    return NextResponse.json({ error: 'Failed to decline lead role' }, { status: 500 })
  }
}
