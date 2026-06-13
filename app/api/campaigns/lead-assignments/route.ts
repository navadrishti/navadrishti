import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth'
import { getCampaignLeadLifecycle } from '@/lib/format-date'
import { readCampaignCategory, readCampaignLocation } from '@/lib/campaign-schema'

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['ngo'])

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, title, description, category, location, schedule_vii, status, start_date, end_date, impact_metrics, created_at, company_id')
      .eq('impact_metrics->>selected_lead_ngo_id', String(user.id))
      .order('created_at', { ascending: false })

    if (error) throw error

    const acceptedCampaigns = (campaigns || []).filter((campaign) => {
      const impact = campaign.impact_metrics && typeof campaign.impact_metrics === 'object'
        ? campaign.impact_metrics
        : {}
      return Boolean(impact.lead_ngo_accepted) && Number(impact.selected_lead_ngo_id || 0) === user.id
    })

    const companyIds = [...new Set(acceptedCampaigns.map((row) => Number(row.company_id || 0)).filter((id) => id > 0))]
    const { data: companies } = companyIds.length > 0
      ? await supabase.from('users').select('id, name, email').in('id', companyIds)
      : { data: [] as any[] }

    const companiesById = new Map<number, any>((companies || []).map((row) => [Number(row.id), row]))

    const payload = acceptedCampaigns.map((campaign) => {
      const impact = campaign.impact_metrics && typeof campaign.impact_metrics === 'object'
        ? campaign.impact_metrics
        : {}
      const company = companiesById.get(Number(campaign.company_id || 0))
      const lifecycle = getCampaignLeadLifecycle({
        startDate: campaign.start_date,
        endDate: campaign.end_date,
        campaignStatus: campaign.status,
      })

      return {
        id: campaign.id,
        campaign_id: campaign.id,
        campaign_title: campaign.title || readCampaignCategory(campaign) || 'CSR Campaign',
        campaign_description: campaign.description || '',
        campaign_location: readCampaignLocation(campaign),
        campaign_category: readCampaignCategory(campaign),
        campaign_status: campaign.status || 'draft',
        start_date: campaign.start_date || null,
        end_date: campaign.end_date || null,
        lifecycle,
        accepted_at: impact.lead_ngo_accepted_at || null,
        company_id: Number(campaign.company_id || 0),
        company_name: company?.name || 'Company',
        company_email: company?.email || '',
      }
    })

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error('Campaign lead assignments error:', error)
    return NextResponse.json({ error: 'Failed to fetch campaign lead assignments' }, { status: 500 })
  }
}
