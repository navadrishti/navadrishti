import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth'
import { resolveCampaignCategoryInput, resolveCampaignLocationInput } from '@/lib/campaign-schema'
import { socialFeedDb } from '@/lib/social-feed-db'
import { buildCampaignSocialPost, buildCampaignSocialTags, resolveAppOrigin } from '@/lib/campaign-social-post'

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

    const category = resolveCampaignCategoryInput(campaign)
    const location = resolveCampaignLocationInput(campaign)

    const nextImpact = {
      ...impact,
      ...(campaign.impact_metrics && typeof campaign.impact_metrics === 'object' ? campaign.impact_metrics : {}),
      lead_ngo_accepted: true,
      selected_lead_ngo_id: impact.selected_lead_ngo_id,
      selected_lead_ngo_name: impact.selected_lead_ngo_name,
      selected_lead_ngo_email: impact.selected_lead_ngo_email,
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

    let socialPostId: string | number | null = impact.social_post_id ?? null
    let socialPostUrl: string | null = impact.social_post_url ?? null

    if (!socialPostId) {
      try {
        const origin = resolveAppOrigin(request)
        const campaignUrl = `${origin}/csr-campaigns/${campaignId}`
        const postContent = buildCampaignSocialPost({
          title: updated.title,
          description: updated.description,
          category: updated.category,
          location: updated.location,
          schedule_vii: updated.schedule_vii,
          start_date: updated.start_date,
          end_date: updated.end_date,
          lead_ngo_name: impact.selected_lead_ngo_name,
          campaign_url: campaignUrl,
        })

        const socialPost = await socialFeedDb.posts.create({
          author_id: user.id,
          content: postContent,
          post_type: 'text',
          tags: buildCampaignSocialTags({
            title: updated.title,
            category: updated.category,
            schedule_vii: updated.schedule_vii,
            campaign_url: campaignUrl,
          }),
          category: 'csr_campaign',
          location: updated.location,
          visibility: 'public',
        })

        socialPostId = socialPost?.id ?? null
        socialPostUrl = socialPostId ? `${origin}/posts/${socialPostId}` : null

        const impactWithSocial = {
          ...nextImpact,
          social_post_id: socialPostId,
          social_post_url: socialPostUrl,
          campaign_public_url: campaignUrl,
          published_to_social_at: new Date().toISOString(),
        }

        await supabase
          .from('campaigns')
          .update({ impact_metrics: impactWithSocial })
          .eq('id', campaignId)
          .eq('company_id', user.id)

        updated.impact_metrics = impactWithSocial
      } catch (socialError) {
        console.error('CSR campaign social post error (campaign still published):', socialError)
      }
    }

    await supabase.from('csr_audit_log').insert({
      entity_type: 'campaign',
      entity_id: campaignId,
      event_type: 'campaign_published',
      event_hash: `campaign_published:${campaignId}:${Date.now()}`,
      event_payload: {
        title: updated.title,
        category: updated.category,
        location: updated.location,
        social_post_id: socialPostId,
      },
      created_by: user.id,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      social_post_id: socialPostId,
      campaign_url: `${resolveAppOrigin(request)}/csr-campaigns/${campaignId}`,
    })
  } catch (error) {
    console.error('CSR agent publish campaign error:', error)
    return NextResponse.json({ error: 'Failed to publish campaign' }, { status: 500 })
  }
}
