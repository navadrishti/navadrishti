import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth'
import { resolveCampaignCategoryInput, resolveCampaignLocationInput } from '@/lib/campaign-schema'
import { resolveAppOrigin } from '@/lib/campaign-social-post'
import { verifyPaidCsrOffersForPublish } from '@/lib/csr-agent/campaign'

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['company'])

    const body = await request.json()
    const campaignId = String(body?.campaign_id || '').trim()
    const campaign = body?.campaign

    if (!campaignId) {
      return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })
    }
    if (!campaign || typeof campaign !== 'object') {
      return NextResponse.json({ error: 'campaign payload is required' }, { status: 400 })
    }

    const { data: existing, error: fetchError } = await supabase
      .from('campaigns')
      .select('id, status, impact_metrics')
      .eq('id', campaignId)
      .eq('company_id', user.id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const impact = existing.impact_metrics && typeof existing.impact_metrics === 'object'
      ? existing.impact_metrics
      : {}

    if (!impact.lead_ngo_accepted || !Number(impact.selected_lead_ngo_id || 0)) {
      return NextResponse.json({
        error: 'A lead NGO must accept the invite from their dashboard before this campaign can be published.',
      }, { status: 409 })
    }

    const invitedOfferIds = Array.isArray(campaign?.impact_metrics?.invited_offer_ids)
      ? campaign.impact_metrics.invited_offer_ids
      : Array.isArray(impact.invited_offer_ids)
        ? impact.invited_offer_ids
        : []
    if (invitedOfferIds.length > 0) {
      await verifyPaidCsrOffersForPublish(campaignId, user.id)
    }

    const category = resolveCampaignCategoryInput(campaign)
    const location = resolveCampaignLocationInput(campaign)
    const campaignUrl = `${resolveAppOrigin(request)}/csr-campaigns/${campaignId}`

    const nextImpact = {
      ...impact,
      ...(campaign.impact_metrics && typeof campaign.impact_metrics === 'object' ? campaign.impact_metrics : {}),
      lead_ngo_accepted: true,
      selected_lead_ngo_id: impact.selected_lead_ngo_id,
      selected_lead_ngo_name: impact.selected_lead_ngo_name,
      selected_lead_ngo_email: impact.selected_lead_ngo_email,
      campaign_public_url: campaignUrl,
      published_at: new Date().toISOString(),
    }

    const { data: updated, error: updateError } = await supabase
      .from('campaigns')
      .update({
        title: campaign.title,
        description: campaign.description ?? null,
        category,
        location,
        budget_inr: campaign.budget_inr ?? null,
        budget_breakdown: campaign.budget_breakdown ?? {},
        schedule_vii: campaign.schedule_vii ?? (category || null),
        sdg_alignment: campaign.sdg_alignment ?? [],
        impact_metrics: nextImpact,
        milestones: campaign.milestones ?? [],
        start_date: campaign.start_date ?? null,
        end_date: campaign.end_date ?? null,
        status: 'active',
      })
      .eq('id', campaignId)
      .eq('company_id', user.id)
      .select('*')
      .single()

    if (updateError) throw updateError

    await supabase.from('csr_audit_log').insert({
      entity_type: 'campaign',
      entity_id: campaignId,
      event_type: 'campaign_published',
      event_hash: `campaign_published:${campaignId}:${Date.now()}`,
      event_payload: {
        title: updated.title,
        category: updated.category,
        location: updated.location,
        campaign_url: campaignUrl,
      },
      created_by: user.id,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      campaign_url: campaignUrl,
    })
  } catch (error) {
    console.error('CSR agent publish campaign error:', error)
    return NextResponse.json({ error: 'Failed to publish campaign' }, { status: 500 })
  }
}
