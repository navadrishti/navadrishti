import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabase } from '@/lib/db';
import {
  JWT_SECRET,
  PHONE_VERIFICATION_ENABLED,
  backfillNgoComplianceProfileData,
  formatGeographicCoverageForSearch,
  formatPastProjectsForSearch,
  getCoverImageUrl,
  getCaComplianceTags,
  mergeNgoPastProjects,
  ngoIsCsrEligible,
  summarizeExecutionCapacity,
  summarizeGeographicCoverage,
} from '@/lib/auth';
import { CSR_SCHEDULE_VII_CATEGORIES, normalizeCompanyFocusAreasScheduleVii } from '@/lib/categories';
import { issueCaBadgeNumber } from '@/lib/navadrishti-ca-auth';
import {
  buildPricingResponse,
  canContributeViaPlatform,
  createNgoNetworkDonationOrder,
  isNgoEligibleForNetworkListing,
  isNgoRazorpayPayoutActive,
  isRazorpayRouteEnabled,
  isVerifiedNgoUser,
  ngoIsEligibleForNetworkListing,
  verifyNgoNetworkDonation,
} from '@/lib/razorpay-route';
import Razorpay from 'razorpay';

interface PaymentJWTPayload {
  id: number;
  user_type: string;
  name?: string;
}

function isFieldOfficerAccount(
  row: { name?: string | null },
  profileData: Record<string, unknown>,
  ngoVerification?: { ngo_name?: string | null } | null
) {
  if (profileData.is_field_officer === true) return true;

  const accountRole = String(profileData.account_role || profileData.role || '').toLowerCase();
  if (accountRole === 'field_officer' || accountRole === 'field officer') return true;

  const name = String(row.name || '').toLowerCase();
  if (name.includes('field officer')) return true;

  const ngoName = String(ngoVerification?.ngo_name || profileData.ngo_name || '').toLowerCase();
  if (ngoName.includes('field officer')) return true;

  return false;
}

function parseProfileData(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function getEffectiveNgoProfileData(value: unknown): Record<string, unknown> {
  return backfillNgoComplianceProfileData(parseProfileData(value)).profileData;
}

function getNgoSize(profileData: Record<string, unknown>) {
  const size = profileData.team_strength ?? profileData.organization_size ?? null;
  if (size === null || size === undefined) return null;
  const text = String(size).trim();
  return text || null;
}

function buildMission(profileData: Record<string, unknown>) {
  const geographicSummary = summarizeGeographicCoverage(profileData.geographic_coverage, 2);

  for (const value of [
    profileData.bio,
    geographicSummary,
    profileData.sectors_schedule_vii,
  ]) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function normalizeProjectStatus(status: unknown): 'completed' | 'ongoing' | 'active' {
  const value = String(status || '').trim().toLowerCase();
  if (['completed', 'fulfilled', 'closed'].includes(value)) return 'completed';
  if (['in_progress', 'ongoing', 'assigned'].includes(value)) return 'ongoing';
  return 'active';
}

function listNgoScheduleViiSectors(
  profileData: Record<string, unknown>,
  ngoVerification?: { sector?: string | null } | null
) {
  return Array.from(
    new Set([
      ...normalizeCompanyFocusAreasScheduleVii(profileData.sectors_schedule_vii),
      ...normalizeCompanyFocusAreasScheduleVii(profileData.sector),
      ...normalizeCompanyFocusAreasScheduleVii(ngoVerification?.sector),
    ])
  );
}

function normalizeNgoRegistrationType(value: unknown): 'Trust' | 'Society' | 'Section 8' | '' {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text.includes('trust')) return 'Trust';
  if (text.includes('society')) return 'Society';
  if (text.includes('section 8') || text.includes('section8') || text.includes('company limited')) {
    return 'Section 8';
  }
  return '';
}

function buildCompliance(
  profileData: Record<string, unknown>,
  registrationType: string | null,
  row?: { email_verified?: boolean | null; phone_verified?: boolean | null },
  ngoVerification?: { verification_status?: string | null; fcra_number?: string | null } | null
) {
  const verified =
    row?.email_verified === true &&
    (!PHONE_VERIFICATION_ENABLED || row?.phone_verified === true) &&
    ngoVerification?.verification_status === 'verified';

  const tags = getCaComplianceTags(profileData, ngoVerification?.verification_status);

  return {
    verified,
    csr1: tags.includes('csr1'),
    section_12a: tags.includes('twelve_a'),
    section_80g: tags.includes('eighty_g'),
    fcra: tags.includes('fcra'),
    section_8: normalizeNgoRegistrationType(registrationType) === 'Section 8',
  };
}

function buildSearchHaystack(
  row: Record<string, unknown>,
  profileData: Record<string, unknown>,
  ngoVerification: Record<string, unknown> | null | undefined,
  mapped: Record<string, unknown>,
  mergedPastProjects: Array<{ title: string; description?: string }>
) {
  return [
    row.name,
    row.email,
    row.location,
    row.city,
    row.state_province,
    mapped.location,
    mapped.sector,
    mapped.mission,
    mapped.registration_type,
    mapped.execution_capacity,
    mapped.size,
    formatPastProjectsForSearch(mergedPastProjects),
    formatGeographicCoverageForSearch(profileData.geographic_coverage),
    profileData.sectors_schedule_vii,
    profileData.bio,
    ngoVerification?.ngo_name,
    ngoVerification?.registration_type,
    ngoVerification?.fcra_number,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const location = (searchParams.get('location') || '').trim();
    const sector = (searchParams.get('sector') || '').trim();
    const compliance = searchParams.get('compliance') || '';
    const registrationType = (searchParams.get('registration_type') || '').trim();
    const verifiedOnly = searchParams.get('verified_only') !== 'false';

    const verificationSelect = verifiedOnly
      ? 'ngo_verifications!inner(verification_status, sector, registration_type, ngo_name, fcra_number)'
      : 'ngo_verifications(verification_status, sector, registration_type, ngo_name, fcra_number)';

    let query = supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        phone,
        profile_image,
        location,
        city,
        state_province,
        country,
        profile_data,
        email_verified,
        phone_verified,
        ${verificationSelect}
      `)
      .eq('user_type', 'ngo')
      .order('name', { ascending: true });

    if (verifiedOnly) {
      query = query.eq('email_verified', true);
      if (PHONE_VERIFICATION_ENABLED) {
        query = query.eq('phone_verified', true);
      }
      query = query.eq('ngo_verifications.verification_status', 'verified');
    }

    const { data, error } = await query;

    if (error) {
      console.error('NGO network query error:', error);
      return Response.json({ success: false, error: 'Failed to fetch NGO network' }, { status: 500 });
    }

    const rows = (data ?? []).filter((row: any) => {
      const profileData = parseProfileData(row.profile_data);
      const ngoVerification = Array.isArray(row.ngo_verifications)
        ? row.ngo_verifications[0]
        : row.ngo_verifications;
      if (isFieldOfficerAccount(row, profileData, ngoVerification)) {
        return false;
      }
      if (!isNgoEligibleForNetworkListing(profileData)) {
        return false;
      }
      return true;
    });

    const ngoIds = rows.map((row: any) => row.id);
    const projectCountByNgoId: Record<number, { completed: number; ongoing: number; active: number }> = {};
    const platformProjectsByNgoId: Record<number, Array<{ title: string; description: string }>> = {};

    if (ngoIds.length > 0) {
      const { data: platformProjectRows, error: platformProjectError } = await supabase
        .from('service_request_projects')
        .select('id, ngo_id, title, description, status, created_at')
        .in('ngo_id', ngoIds)
        .order('created_at', { ascending: false });

      if (platformProjectError) {
        console.error('NGO network platform project lookup error:', platformProjectError);
      }

      for (const row of platformProjectRows ?? []) {
        const ngoId = Number(row.ngo_id || 0);
        if (ngoId <= 0) continue;

        if (!platformProjectsByNgoId[ngoId]) {
          platformProjectsByNgoId[ngoId] = [];
        }

        platformProjectsByNgoId[ngoId].push({
          title: String(row.title || '').trim(),
          description: String(row.description || '').trim(),
        });

        if (!projectCountByNgoId[ngoId]) {
          projectCountByNgoId[ngoId] = { completed: 0, ongoing: 0, active: 0 };
        }

        projectCountByNgoId[ngoId][normalizeProjectStatus(row.status)] += 1;
      }
    }

    let ngos = rows.map((row: any) => {
      const profileData = getEffectiveNgoProfileData(row.profile_data);
      const ngoVerification = Array.isArray(row.ngo_verifications)
        ? row.ngo_verifications[0]
        : row.ngo_verifications;
      const scheduleViiSectors = listNgoScheduleViiSectors(profileData, ngoVerification);
      const registrationTypeValue = normalizeNgoRegistrationType(
        ngoVerification?.registration_type || profileData.registration_type
      );
      const complianceTags = getCaComplianceTags(profileData, ngoVerification?.verification_status);
      const complianceFlags = buildCompliance(
        profileData,
        registrationTypeValue || ngoVerification?.registration_type || null,
        row,
        ngoVerification
      );
      const pastProjects = mergeNgoPastProjects(
        profileData.past_projects,
        platformProjectsByNgoId[row.id] || []
      );
      const geographicCoveragePreview = summarizeGeographicCoverage(profileData.geographic_coverage, 2);
      const locationText = [row.city, row.state_province, row.country || 'India'].filter(Boolean).join(', ');
      const routeReady = isNgoRazorpayPayoutActive(profileData);

      const mapped = {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone ?? null,
        profile_image: row.profile_image ?? null,
        cover_image: getCoverImageUrl(profileData) || null,
        location: locationText || row.location || null,
        sector: scheduleViiSectors[0] || null,
        sectors_schedule_vii: scheduleViiSectors,
        registration_type: registrationTypeValue || null,
        execution_capacity: summarizeExecutionCapacity(profileData.execution_capacity),
        size: getNgoSize(profileData),
        mission: buildMission(profileData),
        past_projects_count: pastProjects.length,
        projects_completed_count: projectCountByNgoId[row.id]?.completed || 0,
        projects_ongoing_count: projectCountByNgoId[row.id]?.ongoing || 0,
        projects_active_count: projectCountByNgoId[row.id]?.active || 0,
        geographic_coverage_preview: geographicCoveragePreview,
        compliance: complianceFlags,
        ca_compliance_tags: complianceTags,
        ca_badge_number: complianceFlags.verified ? issueCaBadgeNumber(row.id, profileData) : null,
        payout_details_on_file: routeReady,
        csr_eligible: ngoIsCsrEligible(ngoVerification?.verification_status, profileData),
        accepts_payments: complianceFlags.verified && routeReady,
      };

      return {
        ...mapped,
        search_haystack: buildSearchHaystack(row, profileData, ngoVerification, mapped, pastProjects),
      };
    });

    if (search) {
      const q = search.toLowerCase();
      ngos = ngos.filter((ngo) => ngo.search_haystack.includes(q));
    }

    if (location) {
      const q = location.toLowerCase();
      ngos = ngos.filter(
        (ngo) =>
          String(ngo.location || '').toLowerCase().includes(q) ||
          String(ngo.geographic_coverage_preview || '').toLowerCase().includes(q)
      );
    }

    if (sector && sector !== 'all') {
      const wanted = sector.toLowerCase();
      ngos = ngos.filter((ngo) =>
        (Array.isArray(ngo.sectors_schedule_vii) ? ngo.sectors_schedule_vii : [])
          .some((item) => String(item).toLowerCase() === wanted)
      );
    }

    if (verifiedOnly) {
      ngos = ngos.filter((ngo) => ngo.compliance.verified);
    }

    if (compliance && compliance !== 'all') {
      ngos = ngos.filter((ngo) => {
        switch (compliance) {
          case 'csr1':
            return ngo.compliance.csr1;
          case '12a':
            return ngo.compliance.section_12a;
          case '80g':
            return ngo.compliance.section_80g;
          case 'fcra':
            return ngo.compliance.fcra;
          default:
            return true;
        }
      });
    }

    if (registrationType && registrationType !== 'all') {
      const wanted = normalizeNgoRegistrationType(registrationType);
      ngos = ngos.filter((ngo) => normalizeNgoRegistrationType(ngo.registration_type) === wanted);
    }

    const payload = ngos.map(({ search_haystack, ...ngo }) => ngo);

    return Response.json({
      success: true,
      ngos: payload,
      sectors: CSR_SCHEDULE_VII_CATEGORIES,
      total: payload.length,
    });
  } catch (err: any) {
    console.error('NGO network error:', err);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as PaymentJWTPayload;

    if (!canContributeViaPlatform(decoded.user_type)) {
      return NextResponse.json({ error: 'Only companies and individuals can pay NGOs from the network' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || 'create-order').toLowerCase();
    const ngoUserId = Number(body?.ngoId || body?.ngo_id || 0);

    if (!Number.isFinite(ngoUserId) || ngoUserId <= 0) {
      return NextResponse.json({ error: 'Invalid NGO id' }, { status: 400 });
    }

    const verifiedNgo = await isVerifiedNgoUser(ngoUserId);
    if (!verifiedNgo.ok) {
      return NextResponse.json({ error: 'This NGO is not available for platform payments' }, { status: 404 });
    }

    const payoutReady = await ngoIsEligibleForNetworkListing(ngoUserId);
    if (!payoutReady) {
      return NextResponse.json(
        { error: 'This NGO has not completed Razorpay payout setup yet' },
        { status: 404 }
      );
    }

    if (decoded.user_type === 'company') {
      const { data: ngoRow } = await supabase
        .from('users')
        .select('verification_status, profile_data')
        .eq('id', ngoUserId)
        .maybeSingle();
      if (!ngoIsCsrEligible(ngoRow?.verification_status, ngoRow?.profile_data)) {
        return NextResponse.json(
          { error: 'Company CSR payments can only go to NGOs with a live CA-allotted CSR-1 tag' },
          { status: 403 }
        );
      }
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay is not configured on this environment' }, { status: 500 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const ngoName = verifiedNgo.name || 'NGO';

    if (action === 'verify') {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } = body || {};

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return NextResponse.json({ error: 'Missing payment verification fields' }, { status: 400 });
      }

      try {
        const result = await verifyNgoNetworkDonation({
          razorpay,
          keySecret,
          ngoUserId,
          contributorId: decoded.id,
          contributorName: decoded.name,
          contributorType: decoded.user_type,
          razorpay_order_id: String(razorpay_order_id),
          razorpay_payment_id: String(razorpay_payment_id),
          razorpay_signature: String(razorpay_signature),
        });

        return NextResponse.json({
          success: true,
          data: {
            message: result.message,
            ngoId: ngoUserId,
            ngoName,
            source: 'ngo_network',
          },
        });
      } catch (verifyError: any) {
        return NextResponse.json(
          { error: verifyError?.message || 'Failed to verify payment' },
          { status: 400 }
        );
      }
    }

    const amountInr = Number(body?.amount || 0);
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      return NextResponse.json({ error: 'Enter a valid contribution amount in INR' }, { status: 400 });
    }

    const { order, pricing } = await createNgoNetworkDonationOrder({
      razorpay,
      ngoUserId,
      ngoName,
      contributorId: decoded.id,
      contributorType: decoded.user_type,
      amountInr,
    });

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        ...buildPricingResponse(pricing),
        currency: order.currency,
        keyId,
        ngoId: ngoUserId,
        ngoName,
        source: 'ngo_network',
        routeEnabled: isRazorpayRouteEnabled(),
        paymentKind: 'ngo_network',
      },
    });
  } catch (error) {
    console.error('NGO network payment error:', error);
    return NextResponse.json({ error: 'Failed to process NGO network payment' }, { status: 500 });
  }
}
