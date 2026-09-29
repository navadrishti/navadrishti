import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, assertUserType, assertNgoCsr1CoversWork, authErrorResponse } from '@/lib/server-auth'
import {
  pickClientImpactMetrics,
  resolveCampaignCategoryInput,
  resolveCampaignLocationInput,
  resolveAppOrigin,
} from '@/lib/campaign-schema'
import { verifyPaidCsrOffersForPublish } from '@/lib/csr-agent/campaign'
import { CSR_WORK_END_DATE_REQUIRED_MESSAGE } from '@/lib/auth'
import { getErrorMessage, parseJsonObject } from '@/lib/utils';

const BUDGET_TOLERANCE_INR = 1

function sumAmounts(values: unknown[]): number | null {
  let total = 0
  for (const value of values) {
    const amount = Number(value ?? 0)
    if (!Number.isFinite(amount) || amount < 0) return null
    total += amount
  }
  return total
}

function validateBudgetAllocation(campaign: Record<string, unknown>): string | null {
  const budget = Number(campaign.budget_inr ?? 0)
  if (!Number.isFinite(budget) || budget <= 0) return null

  const breakdown = parseJsonObject(campaign.budget_breakdown)
  const breakdownValues = Object.values(breakdown)
  if (breakdownValues.length > 0) {
    const total = sumAmounts(breakdownValues)
    if (total === null) return 'budget_breakdown amounts must be non-negative numbers'
    if (Math.abs(total - budget) > BUDGET_TOLERANCE_INR) {
      return `budget_breakdown adds up to ${total} but budget_inr is ${budget}`
    }
  }

  const milestones = Array.isArray(campaign.milestones) ? campaign.milestones : []
  if (milestones.length > 0) {
    const total = sumAmounts(milestones.map((milestone) => parseJsonObject(milestone).budget_allocated))
    if (total === null) return 'Milestone budget_allocated amounts must be non-negative numbers'
    if (Math.abs(total - budget) > BUDGET_TOLERANCE_INR) {
      return `Milestone budgets add up to ${total} but budget_inr is ${budget}`
    }
  }

  return null
}

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
      .select('id, status, impact_metrics, end_date, lead_ngo_user_id')
      .eq('id', campaignId)
      .eq('company_id', user.id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }
    if (String(existing.status || '').toLowerCase() !== 'draft') {
      return NextResponse.json({ error: 'Only draft campaigns can be published' }, { status: 409 })
    }

    const impact = parseJsonObject(existing.impact_metrics)

    const leadNgoId = Number(existing.lead_ngo_user_id || 0)
    if (!impact.lead_ngo_accepted || !leadNgoId) {
      return NextResponse.json({
        error: 'A lead NGO must accept the invite from their dashboard before this campaign can be published.',
      }, { status: 409 })
    }

    const endDate = campaign.end_date ?? existing.end_date
    if (!endDate) {
      return NextResponse.json({ error: CSR_WORK_END_DATE_REQUIRED_MESSAGE }, { status: 400 })
    }

    const coverageGate = await assertNgoCsr1CoversWork(leadNgoId, endDate)
    if (!coverageGate.ok) {
      return NextResponse.json({ error: coverageGate.error }, { status: 403 })
    }

    let invitedOfferIds: number[]
    try {
      invitedOfferIds = await verifyPaidCsrOffersForPublish(campaignId, user.id, campaign?.impact_metrics?.invited_offer_ids)
    } catch (error) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 409 })
    }

    const budgetError = validateBudgetAllocation(campaign)
    if (budgetError) {
      return NextResponse.json({ error: budgetError }, { status: 400 })
    }

    const category = resolveCampaignCategoryInput(campaign)
    const location = resolveCampaignLocationInput(campaign)
    const campaignUrl = `${resolveAppOrigin(request)}/csr-campaigns/${campaignId}`

    const nextImpact = {
      ...impact,
      ...pickClientImpactMetrics(campaign.impact_metrics),
      invited_offer_ids: invitedOfferIds,
      lead_ngo_accepted: true,
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
        lead_ngo_user_id: leadNgoId,
        impact_metrics: nextImpact,
        milestones: campaign.milestones ?? [],
        start_date: campaign.start_date ?? null,
        end_date: endDate,
        status: 'active',
      })
      .eq('id', campaignId)
      .eq('company_id', user.id)
      .eq('status', 'draft')
      .select('*')
      .maybeSingle()

    if (updateError) throw updateError
    if (!updated) {
      return NextResponse.json({ error: 'Only draft campaigns can be published' }, { status: 409 })
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
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('CSR agent publish campaign error:', error)
    return NextResponse.json({ error: 'Failed to publish campaign' }, { status: 500 })
  }
}
