import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, assertUserType, authErrorResponse, findAuthUser } from '@/lib/server-auth'
import { deleteCampaignWithDependencies, formatCampaignDeleteError } from '@/lib/campaign-delete'
import { getCampaignLeadNgoId, parseLeadNgoInvites } from '@/lib/campaign-volunteer-attendance'
import { parseJsonObject } from '@/lib/utils'

async function loadCampaign(campaignId: string) {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()

  if (error || !data) {
    throw new Error('Campaign not found')
  }

  return data
}

function canViewDraft(campaign: Awaited<ReturnType<typeof loadCampaign>>, viewerId: number) {
  if (viewerId <= 0) return false
  if (Number(campaign.company_id || 0) === viewerId) return true
  if (getCampaignLeadNgoId(campaign) === viewerId) return true
  const impact = parseJsonObject(campaign.impact_metrics)
  return parseLeadNgoInvites(impact.lead_ngo_invites).some((invite) => invite.ngo_id === viewerId)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const campaign = await loadCampaign(id)

    if (campaign.status === 'draft') {
      const viewer = findAuthUser(request, { allowCookie: true })
      if (!viewer || !canViewDraft(campaign, Number(viewer.id))) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
      }
    }

    let companyName: string | null = null
    let companyVerificationStatus: string | null = null
    const companyId = Number(campaign.company_id || 0)
    if (companyId > 0) {
      const { data: company } = await supabase
        .from('users')
        .select('id, name, verification_status')
        .eq('id', companyId)
        .maybeSingle()
      companyName = company?.name ? String(company.name).trim() : null
      companyVerificationStatus = company?.verification_status
        ? String(company.verification_status).trim().toLowerCase()
        : null
    }

    let selectedLeadNgoName: string | null = null
    let selectedLeadNgoVerificationStatus: string | null = null
    const selectedLeadNgoId = getCampaignLeadNgoId(campaign)
    if (selectedLeadNgoId > 0) {
      const { data: leadNgo } = await supabase
        .from('users')
        .select('id, name, verification_status')
        .eq('id', selectedLeadNgoId)
        .maybeSingle()
      selectedLeadNgoName = leadNgo?.name ? String(leadNgo.name).trim() : null
      selectedLeadNgoVerificationStatus = leadNgo?.verification_status
        ? String(leadNgo.verification_status).trim().toLowerCase()
        : null
    }

    return NextResponse.json({
      success: true,
      data: {
        ...campaign,
        company_name: companyName,
        company_verification_status: companyVerificationStatus,
        company_verified: companyVerificationStatus === 'verified',
        selected_lead_ngo_name: selectedLeadNgoName,
        selected_lead_ngo_verification_status: selectedLeadNgoVerificationStatus,
        selected_lead_ngo_verified: selectedLeadNgoVerificationStatus === 'verified',
      },
    })
  } catch (error) {
    console.error('Campaign fetch error:', error)
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['company'])

    const { id } = await params
    const campaign = await loadCampaign(id)

    if (Number(campaign.company_id || 0) !== Number(user.id)) {
      return NextResponse.json({ error: 'You can only delete your own campaign' }, { status: 403 })
    }

    await deleteCampaignWithDependencies(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Campaign delete error:', error)
    const message = formatCampaignDeleteError(error)
    const status = (error as { code?: string } | null)?.code === '23503' ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}