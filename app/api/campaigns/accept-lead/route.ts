import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { CSR_ELIGIBILITY_REQUIRED_MESSAGE, CSR_TIMELINE_COVERAGE_REQUIRED_MESSAGE, CSR_WORK_END_DATE_REQUIRED_MESSAGE } from '@/lib/auth'
import { findAuthUser, ngoUserIsCsrEligible, assertNgoCsr1CoversWork } from '@/lib/server-auth'
import { getCampaignLeadNgoId, parseLeadNgoInvites } from '@/lib/campaign-volunteer-attendance'
import { parseJsonObject } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    const user = findAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    if (user.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can accept the lead role' }, { status: 403 })
    }

    if (!(await ngoUserIsCsrEligible(user.id))) {
      return NextResponse.json({ error: CSR_ELIGIBILITY_REQUIRED_MESSAGE }, { status: 403 })
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
      console.error('Failed to fetch campaign for accept:', fetchErr)
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (!campaign.end_date) {
      return NextResponse.json({ error: CSR_WORK_END_DATE_REQUIRED_MESSAGE }, { status: 403 })
    }

    const coverageGate = await assertNgoCsr1CoversWork(user.id, campaign.end_date)
    if (!coverageGate.ok) {
      return NextResponse.json({ error: coverageGate.error || CSR_TIMELINE_COVERAGE_REQUIRED_MESSAGE }, { status: 403 })
    }

    const impact = parseJsonObject(campaign.impact_metrics)
    const status = String(campaign.status || '').toLowerCase()
    const selectedLead = getCampaignLeadNgoId(campaign)
    const invites = parseLeadNgoInvites(impact.lead_ngo_invites)
    const inviteForUser = invites.find((invite) => invite.ngo_id === user.id)
    const actionableInvite = inviteForUser && ['invited', 'pending', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(inviteForUser.status)

    if (status === 'draft') {
      if (!actionableInvite) {
        return NextResponse.json({ error: 'You do not have a pending lead NGO invite for this campaign.' }, { status: 403 })
      }

      if (impact.lead_ngo_accepted && selectedLead > 0 && selectedLead !== user.id) {
        return NextResponse.json({ error: 'A lead NGO is already assigned to this campaign.' }, { status: 409 })
      }

      const updatedInvites = invites.map((invite) => ({
        ...invite,
        status: invite.ngo_id === user.id ? 'accepted' : 'expired',
      }))

      const newImpact = {
        ...impact,
        lead_ngo_invites: updatedInvites,
        lead_ngo_accepted: true,
        lead_ngo_accepted_at: new Date().toISOString(),
      }

      const { data: updated, error: updateErr } = await supabase
        .from('campaigns')
        .update({
          lead_ngo_user_id: user.id,
          impact_metrics: newImpact,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
        .or(`lead_ngo_user_id.is.null,lead_ngo_user_id.eq.${user.id}`)
        .select('*')
        .maybeSingle()

      if (updateErr) {
        console.error('Failed to update draft campaign on accept:', updateErr)
        return NextResponse.json({ error: 'Failed to accept lead role' }, { status: 500 })
      }
      if (!updated) {
        return NextResponse.json({ error: 'A lead NGO is already assigned to this campaign.' }, { status: 409 })
      }

      await supabase.from('csr_audit_log').insert({
        entity_type: 'campaign',
        entity_id: campaignId,
        event_type: 'lead_ngo_accepted',
        event_hash: `lead_ngo_accepted:${campaignId}:${user.id}:${Date.now()}`,
        event_payload: { ngo_id: user.id, draft: true },
        created_by: user.id,
      })

      return NextResponse.json({ success: true, data: updated })
    }

    if (selectedLead !== user.id) {
      return NextResponse.json({ error: 'You are not the selected lead NGO for this campaign' }, { status: 403 })
    }

    const required = Number(impact.volunteer_requirement ?? 0)

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

    await supabase.from('csr_audit_log').insert({
      entity_type: 'campaign',
      entity_id: campaignId,
      event_type: 'lead_ngo_accepted',
      event_hash: `lead_ngo_accepted:${campaignId}:${user.id}:${Date.now()}`,
      event_payload: { ngo_id: user.id, gap, capacity },
      created_by: user.id,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    console.error('Campaign accept error:', e)
    return NextResponse.json({ error: 'Failed to accept lead role' }, { status: 500 })
  }
}
