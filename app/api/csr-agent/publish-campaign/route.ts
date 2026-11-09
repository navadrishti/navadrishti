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
import {
  PublishCampaignError,
  publishCampaignWithProject,
  recordPublishFailureAudit,
} from '@/lib/csr-agent/campaign/create-project-on-publish'
import {
  requireActiveEvidenceVerifierForPublish,
} from '@/lib/csr-agent/campaign/require-evidence-verifier'
import { CompanyCaAssignmentError } from '@/lib/company-ca'
import { CSR_WORK_END_DATE_REQUIRED_MESSAGE } from '@/lib/auth'
import { getErrorMessage, parseJsonObject } from '@/lib/utils'
import { newsletterEventId, withNewsletterHistory } from '@/lib/platform-newsletter/history'
import type { Json } from '@/lib/database.types'

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

async function safeFailureAudit(input: {
  campaignId: string
  actorUserId: number
  errorCode: string
  errorMessage: string
  details?: Record<string, unknown>
}): Promise<PublishCampaignError | null> {
  try {
    await recordPublishFailureAudit(input)
    return null
  } catch (auditError) {
    if (auditError instanceof PublishCampaignError) return auditError
    return new PublishCampaignError(
      getErrorMessage(auditError) || 'Publish failure audit failed',
      'audit_failed',
      500,
      true
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    // Established publish permission: company owner of the campaign (no invented admin role).
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
      .select('*')
      .eq('id', campaignId)
      .eq('company_id', user.id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const existingStatus = String(existing.status || '').toLowerCase()
    const isDraftPublish = existingStatus === 'draft'
    const isActiveEnsure = existingStatus === 'active'
    if (!isDraftPublish && !isActiveEnsure) {
      return NextResponse.json({ error: 'Only draft campaigns can be published' }, { status: 409 })
    }

    const impact = parseJsonObject(existing.impact_metrics)

    const leadNgoId = Number(existing.lead_ngo_user_id || 0)
    if (!impact.lead_ngo_accepted || !leadNgoId) {
      return NextResponse.json({
        error: 'A lead NGO must accept the invite from their dashboard before this campaign can be published.',
      }, { status: 409 })
    }

    // Prefer client draft selection on first publish; stored metrics for ensure/repair.
    const clientImpact = parseJsonObject(campaign.impact_metrics)
    const verifierImpactSource = isActiveEnsure
      ? impact
      : {
          ...impact,
          ...pickClientImpactMetrics(campaign.impact_metrics),
          evidence_verifier_identity_id:
            clientImpact.evidence_verifier_identity_id || impact.evidence_verifier_identity_id,
        }

    let evidenceVerifier: { identityId: string; userId: number }
    try {
      evidenceVerifier = await requireActiveEvidenceVerifierForPublish({
        companyUserId: user.id,
        impactMetrics: verifierImpactSource,
      })
    } catch (error) {
      if (error instanceof CompanyCaAssignmentError) {
        return NextResponse.json({ error: error.message, error_code: 'evidence_verifier_required' }, {
          status: error.status,
        })
      }
      throw error
    }

    // Active ensure/repair uses stored campaign fields so client payload cannot rewrite published data.
    const sourceCampaign = isActiveEnsure ? existing : campaign
    const endDate = isActiveEnsure
      ? existing.end_date
      : (campaign.end_date ?? existing.end_date)
    if (!endDate) {
      return NextResponse.json({ error: CSR_WORK_END_DATE_REQUIRED_MESSAGE }, { status: 400 })
    }

    const coverageGate = await assertNgoCsr1CoversWork(leadNgoId, endDate)
    if (!coverageGate.ok) {
      return NextResponse.json({ error: coverageGate.error }, { status: 403 })
    }

    let invitedOfferIds: number[]
    try {
      const inviteSource = isActiveEnsure
        ? impact.invited_offer_ids
        : campaign?.impact_metrics?.invited_offer_ids
      invitedOfferIds = await verifyPaidCsrOffersForPublish(campaignId, user.id, inviteSource)
    } catch (error) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 409 })
    }

    if (!isActiveEnsure) {
      const budgetError = validateBudgetAllocation(campaign)
      if (budgetError) {
        return NextResponse.json({ error: budgetError }, { status: 400 })
      }
    }

    const category = isActiveEnsure
      ? String(existing.category || '')
      : resolveCampaignCategoryInput(campaign)
    const location = isActiveEnsure
      ? String(existing.location || '')
      : resolveCampaignLocationInput(campaign)
    const campaignUrl = `${resolveAppOrigin(request)}/csr-campaigns/${campaignId}`

    const publishedAt = new Date().toISOString()
    const nextImpact = isActiveEnsure
      ? (existing.impact_metrics as Json)
      : (withNewsletterHistory(
          {
            ...impact,
            ...pickClientImpactMetrics(campaign.impact_metrics),
            invited_offer_ids: invitedOfferIds,
            lead_ngo_accepted: true,
            evidence_verifier_identity_id: evidenceVerifier.identityId,
            evidence_verifier_user_id: evidenceVerifier.userId,
            campaign_public_url: campaignUrl,
            published_at: publishedAt,
          },
          {
            id: newsletterEventId('campaign', campaignId, publishedAt),
            kind: 'campaign',
            at: publishedAt,
            source: 'user',
            href: `/csr-campaigns/${campaignId}`,
          }
        ) as Json)

    const impactObj = parseJsonObject(nextImpact)
    const expectedBeneficiaries = Number(
      impactObj.expected_beneficiaries ?? impactObj.beneficiaries ?? NaN
    )
    const budget = Number(
      (isActiveEnsure ? existing.budget_inr : campaign.budget_inr) ?? NaN
    )

    let projectResult
    try {
      projectResult = await publishCampaignWithProject({
        campaignId,
        companyUserId: user.id,
        actorUserId: user.id,
        leadNgoUserId: leadNgoId,
        title: String(
          (isActiveEnsure ? existing.title : campaign.title) || existing.title || 'CSR Project'
        ),
        description: isActiveEnsure
          ? existing.description ?? null
          : campaign.description ?? null,
        category,
        location,
        budgetInr: Number.isFinite(budget) ? budget : null,
        budgetBreakdown: (isActiveEnsure
          ? existing.budget_breakdown ?? {}
          : campaign.budget_breakdown ?? {}) as Json,
        scheduleVii: isActiveEnsure
          ? existing.schedule_vii ?? null
          : campaign.schedule_vii ?? (category || null),
        sdgAlignment: Array.isArray(
          isActiveEnsure ? existing.sdg_alignment : campaign.sdg_alignment
        )
          ? ((isActiveEnsure ? existing.sdg_alignment : campaign.sdg_alignment) as number[])
          : [],
        impactMetrics: nextImpact,
        milestones: isActiveEnsure
          ? existing.milestones ?? []
          : campaign.milestones ?? [],
        startDate: isActiveEnsure
          ? existing.start_date ?? null
          : campaign.start_date ?? null,
        endDate: String(endDate),
        region: String(location || '').trim() || null,
        totalBudget: Number.isFinite(budget) ? budget : null,
        expectedBeneficiaries: Number.isFinite(expectedBeneficiaries) ? expectedBeneficiaries : null,
        publishedAt,
        campaignUrl,
      })
    } catch (projectError) {
      console.error('CSR transactional publish failed:', projectError)

      const publishError =
        projectError instanceof PublishCampaignError
          ? projectError
          : new PublishCampaignError(
              getErrorMessage(projectError) ||
                'Campaign could not be published because the CSR project could not be created.',
              'publish_failed',
              500
            )

      if (!publishError.auditFailure) {
        const auditFailure = await safeFailureAudit({
          campaignId,
          actorUserId: user.id,
          errorCode: publishError.code,
          errorMessage: publishError.message,
          details: { mode: isActiveEnsure ? 'ensure' : 'publish' },
        })
        if (auditFailure) {
          return NextResponse.json(
            {
              error: publishError.message,
              audit_error: auditFailure.message,
              error_code: publishError.code,
              audit_failed: true,
            },
            { status: 500 }
          )
        }
      }

      return NextResponse.json(
        {
          error: publishError.message,
          error_code: publishError.code,
          audit_failed: Boolean(publishError.auditFailure),
        },
        { status: publishError.status }
      )
    }

    // Preserve prior API contract: return a full campaigns row (not the RPC subset).
    const { data: publishedCampaign, error: reloadError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('company_id', user.id)
      .maybeSingle()

    if (reloadError) throw reloadError

    return NextResponse.json({
      success: true,
      data: publishedCampaign || sourceCampaign,
      campaign_url: campaignUrl,
      csr_project: {
        id: projectResult.project.id,
        created: projectResult.created,
        milestones_created: projectResult.milestonesCreated,
        repaired: projectResult.repaired,
        outcome: projectResult.outcome,
      },
      evidence_verifier_identity_id: evidenceVerifier.identityId,
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('CSR agent publish campaign error:', error)
    return NextResponse.json({ error: 'Failed to publish campaign' }, { status: 500 })
  }
}
