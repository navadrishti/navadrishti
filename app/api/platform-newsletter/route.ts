import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { issueCaBadgeNumber } from '@/lib/platform-ca-auth'

type NewsletterItem = {
  id: string
  kind: 'joined' | 'verified' | 'need' | 'capability' | 'campaign'
  actorName: string
  actorProfileHref: string | null
  actorType: string
  actorImage: string | null
  actorVerificationStatus: string
  actorBadgeNumber: string | null
  title: string
  summary: string
  href: string | null
  createdAt: string
}

function labelUserType(userType: string | null | undefined) {
  switch (String(userType || '').toLowerCase()) {
    case 'ngo':
      return 'NGO'
    case 'company':
      return 'Company'
    case 'individual':
      return 'Professional'
    default:
      return 'Member'
  }
}

function trimText(value: unknown, max = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function isoOrNull(value: unknown) {
  const text = String(value || '').trim()
  return text ? text : null
}

function getProfileRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function resolveActorName(
  fallbackName: unknown,
  userType: unknown,
  profileData: unknown
) {
  const rawName = String(fallbackName || '').trim()
  const type = String(userType || '').toLowerCase()
  const profile = getProfileRecord(profileData)

  const preferredName =
    type === 'ngo'
      ? String(profile?.ngo_name || '').trim()
      : type === 'company'
        ? String(profile?.company_name || '').trim()
        : ''

  if (preferredName) return preferredName

  if (/field officer/i.test(rawName)) {
    const orgLikeName = String(
      profile?.ngo_name ||
      profile?.company_name ||
      profile?.organization_name ||
      ''
    ).trim()
    if (orgLikeName) return orgLikeName
  }

  return rawName || 'A member'
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 15), 1), 30)
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0)
    const sourceFetchLimit = Math.min(Math.max(limit + offset + 10, 30), 120)

    const [usersRes, verifiedRes, requestsRes, offersRes, campaignsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, name, user_type, profile_image, profile_data, verification_status, created_at')
        .in('user_type', ['individual', 'ngo', 'company'])
        .order('created_at', { ascending: false })
        .limit(sourceFetchLimit),
      supabase
        .from('users')
        .select('id, name, user_type, profile_image, profile_data, verified_at, updated_at, verification_status')
        .eq('verification_status', 'verified')
        .order('verified_at', { ascending: false })
        .limit(sourceFetchLimit),
      supabase
        .from('service_requests')
        .select(`
          id,
          title,
          description,
          location,
          created_at,
          requester:users!ngo_id (
            id,
            name,
            user_type,
            profile_image,
            profile_data,
            verification_status
          )
        `)
        .order('created_at', { ascending: false })
        .limit(sourceFetchLimit),
      supabase
        .from('service_offers')
        .select(`
          id,
          title,
          description,
          city,
          state_province,
          coverage_area,
          created_at,
          ngo:users!creator_id (
            id,
            name,
            user_type,
            profile_image,
            profile_data,
            verification_status
          )
        `)
        .order('created_at', { ascending: false })
        .limit(sourceFetchLimit),
      supabase
        .from('campaigns')
        .select('id, title, description, location, created_at, company_id')
        .order('created_at', { ascending: false })
        .limit(sourceFetchLimit),
    ])

    if (usersRes.error) throw usersRes.error
    if (verifiedRes.error) throw verifiedRes.error
    if (requestsRes.error) throw requestsRes.error
    if (offersRes.error) throw offersRes.error
    if (campaignsRes.error) throw campaignsRes.error

    const campaigns = campaignsRes.data ?? []
    const verifiedUsers = verifiedRes.data ?? []
    const verifiedUserIds = verifiedUsers.map((user) => Number(user.id || 0)).filter((id) => id > 0)
    const companyIds = Array.from(
      new Set(campaigns.map((item) => Number(item.company_id || 0)).filter((id) => id > 0))
    )

    const [individualVerificationsRes, companyVerificationsRes, ngoVerificationsRes] = verifiedUserIds.length > 0
      ? await Promise.all([
          supabase
            .from('individual_verifications')
            .select('user_id, verification_date, reviewed_at')
            .in('user_id', verifiedUserIds),
          supabase
            .from('company_verifications')
            .select('user_id, verification_date, reviewed_at')
            .in('user_id', verifiedUserIds),
          supabase
            .from('ngo_verifications')
            .select('user_id, verification_date, reviewed_at')
            .in('user_id', verifiedUserIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ]

    if (individualVerificationsRes.error) throw individualVerificationsRes.error
    if (companyVerificationsRes.error) throw companyVerificationsRes.error
    if (ngoVerificationsRes.error) throw ngoVerificationsRes.error

    const verificationDateByUserId: Record<number, string> = {}
    for (const row of [
      ...(individualVerificationsRes.data ?? []),
      ...(companyVerificationsRes.data ?? []),
      ...(ngoVerificationsRes.data ?? []),
    ]) {
      const userId = Number(row.user_id || 0)
      const timestamp = isoOrNull(row.reviewed_at) || isoOrNull(row.verification_date)
      if (userId > 0 && timestamp && !verificationDateByUserId[userId]) {
        verificationDateByUserId[userId] = timestamp
      }
    }

    let companiesById: Record<number, { name: string; user_type: string; profile_image: string | null; profile_data: Record<string, unknown> | null; verification_status: string }> = {}
    if (companyIds.length > 0) {
      const { data: companies, error: companiesError } = await supabase
        .from('users')
        .select('id, name, user_type, profile_image, profile_data, verification_status')
        .in('id', companyIds)

      if (companiesError) throw companiesError

      companiesById = Object.fromEntries(
        (companies ?? []).map((company) => [
          Number(company.id),
          {
            name: String(company.name || 'A company'),
            user_type: String(company.user_type || 'company'),
            profile_image: company.profile_image ? String(company.profile_image) : null,
            profile_data: company.profile_data && typeof company.profile_data === 'object' ? company.profile_data as Record<string, unknown> : null,
            verification_status: String(company.verification_status || 'unverified'),
          },
        ])
      )
    }

    const items: NewsletterItem[] = []

    for (const user of usersRes.data ?? []) {
      items.push({
        id: `joined-${user.id}`,
        kind: 'joined',
        actorName: resolveActorName(user.name, user.user_type, user.profile_data),
        actorProfileHref: `/profile/${user.id}`,
        actorType: labelUserType(user.user_type),
        actorImage: user.profile_image ? String(user.profile_image) : null,
        actorVerificationStatus: String(user.verification_status || 'unverified'),
        actorBadgeNumber: String(user.verification_status || '').toLowerCase() === 'verified'
          ? issueCaBadgeNumber(Number(user.id), user.profile_data)
          : null,
        title: `${resolveActorName(user.name, user.user_type, user.profile_data)} joined GRAM`,
        summary: '',
        href: null,
        createdAt: String(user.created_at),
      })
    }

    for (const user of verifiedUsers) {
      const createdAt =
        isoOrNull(user.verified_at) ||
        verificationDateByUserId[Number(user.id || 0)] ||
        isoOrNull(user.updated_at)
      if (!createdAt) continue
      items.push({
        id: `verified-${user.id}-${createdAt}`,
        kind: 'verified',
        actorName: resolveActorName(user.name, user.user_type, user.profile_data),
        actorProfileHref: `/profile/${user.id}`,
        actorType: labelUserType(user.user_type),
        actorImage: user.profile_image ? String(user.profile_image) : null,
        actorVerificationStatus: String(user.verification_status || 'unverified'),
        actorBadgeNumber: String(user.verification_status || '').toLowerCase() === 'verified'
          ? issueCaBadgeNumber(Number(user.id), user.profile_data)
          : null,
        title: `${resolveActorName(user.name, user.user_type, user.profile_data)} was verified on GRAM`,
        summary: '',
        href: null,
        createdAt,
      })
    }

    for (const request of requestsRes.data ?? []) {
      const requester = Array.isArray(request.requester) ? request.requester[0] : request.requester
      const actorName = resolveActorName(requester?.name, requester?.user_type, requester?.profile_data)
      const actorType = labelUserType(requester?.user_type)
      items.push({
        id: `need-${request.id}`,
        kind: 'need',
        actorName,
        actorProfileHref: requester?.id ? `/profile/${requester.id}` : null,
        actorType,
        actorImage: requester?.profile_image ? String(requester.profile_image) : null,
        actorVerificationStatus: String(requester?.verification_status || 'unverified'),
        actorBadgeNumber: String(requester?.verification_status || '').toLowerCase() === 'verified'
          ? issueCaBadgeNumber(Number(requester?.id || 0), requester?.profile_data)
          : null,
        title: `${actorName} posted a new NGO need`,
        summary: trimText(request.title || request.location || request.description || 'A new need is now live on the platform.'),
        href: `/service-requests/${request.id}`,
        createdAt: String(request.created_at),
      })
    }

    for (const offer of offersRes.data ?? []) {
      const ngo = Array.isArray(offer.ngo) ? offer.ngo[0] : offer.ngo
      const actorName = resolveActorName(ngo?.name, ngo?.user_type, ngo?.profile_data)
      const actorType = labelUserType(ngo?.user_type)
      items.push({
        id: `capability-${offer.id}`,
        kind: 'capability',
        actorName,
        actorProfileHref: ngo?.id ? `/profile/${ngo.id}` : null,
        actorType,
        actorImage: ngo?.profile_image ? String(ngo.profile_image) : null,
        actorVerificationStatus: String(ngo?.verification_status || 'unverified'),
        actorBadgeNumber: String(ngo?.verification_status || '').toLowerCase() === 'verified'
          ? issueCaBadgeNumber(Number(ngo?.id || 0), ngo?.profile_data)
          : null,
        title: `${actorName} posted a new capability offer`,
        summary: trimText(
          offer.title ||
            [offer.city, offer.state_province, offer.coverage_area].filter(Boolean).join(', ') ||
            offer.description ||
            'A new capability offer is now live on the platform.'
        ),
        href: `/service-offers/${offer.id}`,
        createdAt: String(offer.created_at),
      })
    }

    for (const campaign of campaigns) {
      const company = companiesById[Number(campaign.company_id || 0)]
      const actorName = resolveActorName(company?.name, company?.user_type || 'company', company?.profile_data)
      items.push({
        id: `campaign-${campaign.id}`,
        kind: 'campaign',
        actorName,
        actorProfileHref: campaign.company_id ? `/profile/${campaign.company_id}` : null,
        actorType: labelUserType(company?.user_type || 'company'),
        actorImage: company?.profile_image || null,
        actorVerificationStatus: String(company?.verification_status || 'unverified'),
        actorBadgeNumber: String(company?.verification_status || '').toLowerCase() === 'verified'
          ? issueCaBadgeNumber(Number(campaign.company_id || 0), company?.profile_data)
          : null,
        title: `${actorName} launched a CSR campaign`,
        summary: trimText(campaign.title || campaign.location || campaign.description || 'A new CSR campaign is now live on the platform.'),
        href: `/csr-campaigns/${campaign.id}`,
        createdAt: String(campaign.created_at),
      })
    }

    const sortedItems = items
      .filter((item) => Boolean(item.createdAt))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    const pagedItems = sortedItems.slice(offset, offset + limit)

    return NextResponse.json({
      success: true,
      data: pagedItems,
      pagination: {
        limit,
        offset,
        hasMore: sortedItems.length > offset + limit,
        total: sortedItems.length,
      },
    })
  } catch (error) {
    console.error('Platform newsletter error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load platform newsletter' }, { status: 500 })
  }
}
