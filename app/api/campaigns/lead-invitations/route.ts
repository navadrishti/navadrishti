import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['ngo'])

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, title, description, category, location, schedule_vii, status, impact_metrics, created_at, company_id')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })

    if (error) throw error

    const companyIds = [...new Set((campaigns || []).map((row) => Number(row.company_id || 0)).filter((id) => id > 0))]
    const { data: companies } = companyIds.length > 0
      ? await supabase.from('users').select('id, name, email').in('id', companyIds)
      : { data: [] as any[] }

    const companiesById = new Map<number, any>((companies || []).map((row) => [Number(row.id), row]))

    const payload = (campaigns || [])
      .map((campaign) => {
        const impact = campaign.impact_metrics && typeof campaign.impact_metrics === 'object'
          ? campaign.impact_metrics
          : {}
        const invites = Array.isArray(impact.lead_ngo_invites) ? impact.lead_ngo_invites : []
        const invite = invites.find((item: any) => Number(item?.ngo_id || item?.ngoId || 0) === user.id)
        if (!invite) return null

        const inviteStatus = String(invite.status || 'invited').toLowerCase()

        if (impact.lead_ngo_accepted && Number(impact.selected_lead_ngo_id || 0) === user.id) {
          return null
        }

        if (['rejected', 'expired', 'accepted'].includes(inviteStatus)) {
          return null
        }

        if (!['invited', 'pending', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(inviteStatus)) {
          return null
        }

        if (impact.lead_ngo_accepted && Number(impact.selected_lead_ngo_id || 0) !== user.id) {
          return null
        }

        const company = companiesById.get(Number(campaign.company_id || 0))
        return {
          id: campaign.id,
          campaign_id: campaign.id,
          campaign_title: campaign.title || 'CSR Campaign',
          campaign_description: campaign.description || '',
          campaign_location: campaign.location || '',
          campaign_cause: campaign.schedule_vii || campaign.category || '',
          status: inviteStatus,
          invited_at: invite.invited_at || campaign.created_at,
          company_id: Number(campaign.company_id || 0),
          company_name: company?.name || 'Company',
          company_email: company?.email || '',
        }
      })
      .filter(Boolean)

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error('Campaign lead invitations error:', error)
    return NextResponse.json({ error: 'Failed to fetch campaign lead invitations' }, { status: 500 })
  }
}
