import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { supabase } from '@/lib/db'
import { JWT_SECRET } from '@/lib/auth'

interface JWTPayload {
  id: number
  user_type: string
  email?: string
  name?: string
}

function safeJson(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, any>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    const allowed = decoded.user_type === 'ngo' || decoded.user_type === 'individual'
    if (!allowed) {
      return NextResponse.json({ error: 'Only NGO or individual volunteers can apply' }, { status: 403 })
    }

    const { id } = await params
    const campaign = await loadCampaign(id)
    const impact = safeJson(campaign.impact_metrics)
    const volunteerApplications = Array.isArray(impact.volunteer_applications) ? impact.volunteer_applications : []

    const existing = volunteerApplications.find((entry: any) => Number(entry?.user_id || 0) === Number(decoded.id))
    if (existing) {
      return NextResponse.json({ success: true, data: { campaign_id: id, applied: true, existing } })
    }

    // deadline: volunteering closes the day before campaign start at 23:59
    const startDateStr = campaign.start_date as string | null
    if (startDateStr) {
      const startDate = new Date(startDateStr)
      const allowedUntil = new Date(startDate)
      allowedUntil.setDate(startDate.getDate() - 1)
      allowedUntil.setHours(23, 59, 59, 999)
      if (new Date() > allowedUntil) {
        return NextResponse.json({ error: 'Volunteering for this campaign has closed' }, { status: 400 })
      }
    }

    // check other overlapping campaign registrations for same user
    const { data: otherCampaigns } = await supabase
      .from('campaigns')
      .select('id, start_date, end_date, impact_metrics')
      .neq('id', id)

    if (Array.isArray(otherCampaigns)) {
      const myStart = campaign.start_date ? new Date(String(campaign.start_date)) : null
      const myEnd = campaign.end_date ? new Date(String(campaign.end_date)) : null
      for (const other of otherCampaigns) {
        try {
          const otherImpact = safeJson(other.impact_metrics)
          const otherApps = Array.isArray(otherImpact.volunteer_applications) ? otherImpact.volunteer_applications : []
          const appliedThere = otherApps.some((a: any) => Number(a?.user_id || 0) === Number(decoded.id))
          if (!appliedThere) continue

          const otherStart = other.start_date ? new Date(String(other.start_date)) : null
          const otherEnd = other.end_date ? new Date(String(other.end_date)) : null

          // if both campaigns have dates, check for overlap
          if (myStart && myEnd && otherStart && otherEnd) {
            const overlap = myStart <= otherEnd && otherStart <= myEnd
            if (overlap) {
              return NextResponse.json({ error: 'You are already registered for another campaign during this period' }, { status: 400 })
            }
          }
        } catch (e) {
          // ignore malformed entries
        }
      }
    }

    const { data: actingUser } = await supabase
      .from('users')
      .select('id, name, user_type, ngo_volunteer_capacity, profile_data, email_verified, phone_verified, verification_status')
      .eq('id', decoded.id)
      .maybeSingle()

    // require all three verifications: email, phone, and verification_status === 'verified'
    if (!(actingUser?.email_verified && actingUser?.phone_verified && String(actingUser?.verification_status || '').toLowerCase() === 'verified')) {
      return NextResponse.json({ error: 'Complete email, phone and document verifications to volunteer' }, { status: 403 })
    }

    const capacity = decoded.user_type === 'ngo'
      ? Number(actingUser?.ngo_volunteer_capacity ?? actingUser?.profile_data?.ngo_volunteer_capacity ?? actingUser?.profile_data?.team_strength ?? 1) || 1
      : 1

    const entry = {
      user_id: Number(decoded.id),
      user_type: decoded.user_type,
      name: String(actingUser?.name || decoded.name || ''),
      capacity,
      applied_at: new Date().toISOString()
    }

    const nextApplications = [...volunteerApplications, entry]
    const volunteerCount = nextApplications.reduce((sum: number, item: any) => sum + toNumber(item?.capacity || 1), 0)
    // enforce volunteer limit if configured
    const volunteerLimit = Number(impact.volunteer_requirement ?? impact.volunteer_limit ?? 0) || 0
    if (volunteerLimit > 0 && volunteerCount > volunteerLimit) {
      return NextResponse.json({ error: 'Volunteer capacity for this campaign is full' }, { status: 400 })
    }
    const nextImpact = {
      ...impact,
      volunteer_applications: nextApplications,
      volunteer_count: volunteerCount,
      volunteer_last_applied_at: entry.applied_at
    }

    const { data, error } = await supabase
      .from('campaigns')
      .update({
        impact_metrics: nextImpact,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error || !data) {
      throw new Error(error?.message || 'Failed to apply for campaign')
    }

    return NextResponse.json({ success: true, data: { campaign: data, applied: true, capacity, volunteerCount } })
  } catch (error: any) {
    console.error('Campaign volunteer application error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to apply for campaign' }, { status: 500 })
  }
}