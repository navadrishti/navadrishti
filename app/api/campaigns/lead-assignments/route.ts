import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth'
import { getCampaignLeadLifecycle } from '@/lib/format-date'
import { readCampaignCategory, readCampaignLocation } from '@/lib/campaign-schema'
import {
  assertCsrCapabilityDeliveryAccess,
  bookCsrCapabilityRentalDelhivery,
  linkCsrCapabilityRentalTracking,
  listCsrCapabilityRentalsForUser,
  loadCampaignRentalByOffer,
  retryCsrCapabilityDelhiveryBooking,
  syncCsrCapabilityRentalDelhivery,
} from '@/lib/csr-agent/campaign'

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['ngo', 'company'])

    const rentalsOnly = request.nextUrl.searchParams.get('rentals') === '1'
    if (rentalsOnly) {
      const rentals = await listCsrCapabilityRentalsForUser(Number(user.id))
      return NextResponse.json({ success: true, data: rentals })
    }

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

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['ngo', 'company'])

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '').trim()
    const campaignId = String(body?.campaign_id || '').trim()
    const offerId = Number(body?.offer_id || 0)
    const leg = String(body?.leg || '').trim() as 'outbound' | 'return'

    if (!campaignId || !Number.isFinite(offerId) || offerId <= 0) {
      return NextResponse.json({ error: 'campaign_id and offer_id are required' }, { status: 400 })
    }
    if (leg !== 'outbound' && leg !== 'return') {
      return NextResponse.json({ error: 'leg must be outbound or return' }, { status: 400 })
    }

    const { rental } = await loadCampaignRentalByOffer(campaignId, offerId)
    assertCsrCapabilityDeliveryAccess({ userId: Number(user.id), rental, leg })

    if (action === 'capability_rental_link_tracking') {
      const trackingId = String(body?.tracking_id || body?.trackingId || '').trim()
      const updated = await linkCsrCapabilityRentalTracking({
        campaignId,
        offerId,
        leg,
        trackingId,
      })
      return NextResponse.json({ success: true, data: { rental: updated } })
    }

    if (action === 'capability_rental_sync_delivery') {
      const trackingId = String(body?.tracking_id || body?.trackingId || '').trim()
      const updated = await syncCsrCapabilityRentalDelhivery({
        campaignId,
        offerId,
        leg,
        trackingId: trackingId || undefined,
      })
      return NextResponse.json({ success: true, data: { rental: updated } })
    }

    if (action === 'capability_rental_retry_booking') {
      const updated = await retryCsrCapabilityDelhiveryBooking({
        campaignId,
        offerId,
        leg,
        bookedByUserId: Number(user.id),
        companyId: Number(rental.company_user_id || 0) || undefined,
      })
      return NextResponse.json({ success: true, data: { rental: updated } })
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (error: any) {
    console.error('CSR capability rental delivery error:', error)
    const message = error?.message || 'Failed to update CSR capability delivery'
    const status = message.toLowerCase().includes('permission') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
