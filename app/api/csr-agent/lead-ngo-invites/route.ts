import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import {
  assertCsr1CoversRequiredThrough,
  normalizeExpiryDate,
  CSR_WORK_END_DATE_REQUIRED_MESSAGE,
} from '@/lib/auth'
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth'
import { parseLeadNgoInvites, type LeadNgoInvite } from '@/lib/campaign-volunteer-attendance'
import { parseJsonObject } from '@/lib/utils'

function summarizeLeadInviteState(campaign: {
  id: string
  impact_metrics?: Record<string, any> | null
  lead_ngo_user_id?: number | null
}) {
  const impact = parseJsonObject(campaign.impact_metrics)
  const invites = parseLeadNgoInvites(impact.lead_ngo_invites)
  const leadNgoId = Number(campaign.lead_ngo_user_id || 0) || null
  const leadInvite = leadNgoId ? invites.find((invite) => invite.ngo_id === leadNgoId) : undefined
  return {
    draftCampaignId: campaign.id,
    leadNgoAccepted: Boolean(impact.lead_ngo_accepted),
    selectedLeadNgoId: leadNgoId,
    selectedLeadNgoName: leadInvite?.name || null,
    selectedLeadNgoEmail: leadInvite?.email || null,
    invites,
  }
}

function readProjectEndDate(projectData: Record<string, any>, campaign?: any): string | null {
  return (
    normalizeExpiryDate(projectData?.endDate) ||
    normalizeExpiryDate(projectData?.end_date) ||
    normalizeExpiryDate(campaign?.end_date) ||
    null
  )
}

function readProjectStartDate(projectData: Record<string, any>): string | null {
  return normalizeExpiryDate(projectData?.startDate) || normalizeExpiryDate(projectData?.start_date)
}

function buildDraftPayload(
  companyId: number,
  sessionId: string,
  projectData: Record<string, string>,
  volunteerRequirement: string,
  invites: LeadNgoInvite[],
) {
  const title = String(projectData.campaignName || 'CSR Campaign Draft').trim() || 'CSR Campaign Draft'
  const category = String(projectData.category || 'Community development').trim()
  const location = [projectData.city, projectData.state].filter(Boolean).join(', ') || 'India'
  const startDate = readProjectStartDate(projectData)
  const endDate = readProjectEndDate(projectData)

  return {
    company_id: companyId,
    title,
    description: 'Draft campaign pending lead NGO acceptance.',
    category,
    location,
    schedule_vii: category,
    status: 'draft',
    start_date: startDate,
    end_date: endDate,
    impact_metrics: {
      csr_agent_session_id: sessionId,
      volunteer_requirement: volunteerRequirement || '',
      lead_ngo_invites: invites,
      lead_ngo_accepted: false,
    },
  }
}

async function findDraftBySession(sessionId: string, companyId: number) {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, status, impact_metrics, start_date, end_date, lead_ngo_user_id')
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .eq('impact_metrics->>csr_agent_session_id', sessionId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['company'])

    const sessionId = String(new URL(request.url).searchParams.get('sessionId') || '').trim()
    const draftCampaignId = String(new URL(request.url).searchParams.get('draftCampaignId') || '').trim()

    let campaign: any = null
    if (draftCampaignId) {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, status, impact_metrics, start_date, end_date, lead_ngo_user_id')
        .eq('id', draftCampaignId)
        .eq('company_id', user.id)
        .maybeSingle()
      if (error) throw error
      campaign = data
    } else if (sessionId) {
      campaign = await findDraftBySession(sessionId, user.id)
    }

    if (!campaign) {
      return NextResponse.json({
        success: true,
        data: {
          draftCampaignId: null,
          leadNgoAccepted: false,
          selectedLeadNgoId: null,
          selectedLeadNgoName: null,
          selectedLeadNgoEmail: null,
          invites: [],
        },
      })
    }

    return NextResponse.json({ success: true, data: summarizeLeadInviteState(campaign) })
  } catch (error) {
    console.error('CSR agent lead invite fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch lead NGO invite status' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['company'])

    const body = await request.json()
    const sessionId = String(body?.sessionId || '').trim()
    const action = String(body?.action || 'invite').trim()
    const ngoId = Number(body?.ngoId || 0)
    const ngoName = String(body?.ngoName || '').trim()
    const ngoEmail = String(body?.ngoEmail || '').trim()
    const projectData = body?.projectData && typeof body.projectData === 'object' ? body.projectData : {}
    const volunteerRequirement = String(body?.volunteerRequirement || '').trim()
    let draftCampaignId = String(body?.draftCampaignId || '').trim()

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }
    if (!Number.isFinite(ngoId) || ngoId <= 0) {
      return NextResponse.json({ error: 'Valid ngoId is required' }, { status: 400 })
    }

    let campaign: any = null
    if (draftCampaignId) {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, status, impact_metrics, start_date, end_date, lead_ngo_user_id')
        .eq('id', draftCampaignId)
        .eq('company_id', user.id)
        .maybeSingle()
      if (error) throw error
      campaign = data
    } else {
      campaign = await findDraftBySession(sessionId, user.id)
      if (campaign?.id) draftCampaignId = String(campaign.id)
    }

    if (action !== 'revoke') {
      const campaignEnd = readProjectEndDate(projectData, campaign)
      if (!campaignEnd) {
        return NextResponse.json({ error: CSR_WORK_END_DATE_REQUIRED_MESSAGE }, { status: 400 })
      }

      const { data: ngoRow } = await supabase
        .from('users')
        .select('user_type, verification_status, profile_data')
        .eq('id', ngoId)
        .maybeSingle()

      if (!ngoRow || ngoRow.user_type !== 'ngo') {
        return NextResponse.json({ error: 'Lead NGO invites are limited to verified NGOs' }, { status: 400 })
      }

      const gate = assertCsr1CoversRequiredThrough(
        ngoRow.verification_status,
        ngoRow.profile_data,
        campaignEnd
      )
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: 400 })
      }

      // Extending the campaign end must keep every already-invited NGO covered.
      const existingImpact = parseJsonObject(campaign?.impact_metrics)
      const existingInviteIds = parseLeadNgoInvites(existingImpact.lead_ngo_invites)
        .map((invite) => invite.ngo_id)
        .filter((id) => id !== ngoId)
      if (existingInviteIds.length > 0) {
        const { data: existingNgos } = await supabase
          .from('users')
          .select('id, verification_status, profile_data')
          .in('id', existingInviteIds)
        for (const row of existingNgos || []) {
          const existingGate = assertCsr1CoversRequiredThrough(
            row.verification_status,
            row.profile_data,
            campaignEnd
          )
          if (!existingGate.ok) {
            return NextResponse.json(
              {
                error:
                  existingGate.error ||
                  'CSR-1 must cover the full campaign window for every invited lead NGO before the end date can be used.',
              },
              { status: 400 }
            )
          }
        }
      }
    }

    const impact = parseJsonObject(campaign?.impact_metrics)

    if (impact.lead_ngo_accepted || Number(campaign?.lead_ngo_user_id || 0) > 0) {
      return NextResponse.json({ error: 'A lead NGO has already accepted for this campaign draft.' }, { status: 409 })
    }

    let invites = parseLeadNgoInvites(impact.lead_ngo_invites)

    if (action === 'revoke') {
      invites = invites.filter((invite) => invite.ngo_id !== ngoId)
    } else {
      const existing = invites.find((invite) => invite.ngo_id === ngoId)
      if (!existing) {
        invites = [
          ...invites,
          {
            ngo_id: ngoId,
            name: ngoName,
            email: ngoEmail,
            status: 'invited',
            invited_at: new Date().toISOString(),
          },
        ]
      }
    }

    const startDate = readProjectStartDate(projectData)
    const endDate = readProjectEndDate(projectData, campaign)

    if (!campaign) {
      const payload = buildDraftPayload(user.id, sessionId, projectData, volunteerRequirement, invites)
      const { data: inserted, error: insertError } = await supabase
        .from('campaigns')
        .insert(payload)
        .select('id, status, impact_metrics, start_date, end_date, lead_ngo_user_id')
        .single()

      if (insertError) throw insertError
      campaign = inserted
      draftCampaignId = String(inserted.id)
    } else {
      const nextImpact = {
        ...impact,
        csr_agent_session_id: sessionId,
        volunteer_requirement: volunteerRequirement || impact.volunteer_requirement || '',
        lead_ngo_invites: invites,
      }

      const { data: updated, error: updateError } = await supabase
        .from('campaigns')
        .update({
          impact_metrics: nextImpact,
          ...(startDate ? { start_date: startDate } : {}),
          ...(endDate ? { end_date: endDate } : {}),
        })
        .eq('id', campaign.id)
        .eq('company_id', user.id)
        .select('id, status, impact_metrics, start_date, end_date, lead_ngo_user_id')
        .single()

      if (updateError) throw updateError
      campaign = updated
    }

    return NextResponse.json({ success: true, data: summarizeLeadInviteState(campaign) })
  } catch (error) {
    console.error('CSR agent lead invite error:', error)
    return NextResponse.json({ error: 'Failed to update lead NGO invites' }, { status: 500 })
  }
}
