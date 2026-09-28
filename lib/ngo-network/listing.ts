import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';
import {
  getTokenClaims,
  PHONE_VERIFICATION_ENABLED,
  getCoverImageUrl,
  getCaComplianceTags,
  mergeNgoPastProjects,
  ngoIsCsrEligible,
  summarizeExecutionCapacity,
  summarizeGeographicCoverage,
} from '@/lib/auth';
import { issueCaBadgeNumber } from '@/lib/platform-ca-auth';
import type { ViewerRecommendationProfile } from '@/lib/csr-agent/recommendation-utils';
import { isNgoRazorpayPayoutActive } from '@/lib/razorpay-route';
import { parseJsonObject } from '@/lib/utils';
import {
  buildCompliance,
  buildMission,
  buildSearchHaystack,
  getEffectiveNgoProfileData,
  getNgoSize,
  isFieldOfficerAccount,
  listNgoScheduleViiSectors,
  normalizeNgoRegistrationType,
  normalizeProjectStatus,
} from './ngo-profile';

type ProjectCounts = { completed: number; ongoing: number; active: number };

export async function loadRecommendationViewer(request: NextRequest): Promise<ViewerRecommendationProfile | null> {
  const claims = getTokenClaims(request);
  if (!claims) return null;

  try {
    const viewerId = Number(claims.id || 0);
    if (viewerId <= 0) return null;

    const { data: viewerRow } = await supabase
      .from('users')
      .select('id, user_type, city, state_province, location, pincode, country, industry, profile_data')
      .eq('id', viewerId)
      .maybeSingle();
    if (!viewerRow) return null;

    return {
      id: Number(viewerRow.id),
      user_type: String(viewerRow.user_type || ''),
      city: viewerRow.city ?? null,
      state_province: viewerRow.state_province ?? null,
      location: viewerRow.location ?? null,
      pincode: viewerRow.pincode ?? null,
      country: viewerRow.country ?? null,
      industry: viewerRow.industry ?? null,
      profile_data: parseJsonObject(viewerRow.profile_data),
    };
  } catch {
    return null;
  }
}

async function loadPlatformProjects(ngoIds: number[]) {
  const projectCountByNgoId: Record<number, ProjectCounts> = {};
  const platformProjectsByNgoId: Record<number, Array<{ title: string; description: string }>> = {};

  if (ngoIds.length === 0) {
    return { projectCountByNgoId, platformProjectsByNgoId };
  }

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

  return { projectCountByNgoId, platformProjectsByNgoId };
}

export async function loadNetworkNgos(verifiedOnly: boolean) {
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
      verification_status,
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
    return null;
  }

  const rows = (data ?? []).filter((row) => {
    const profileData = parseJsonObject(row.profile_data);
    const ngoVerification = Array.isArray(row.ngo_verifications)
      ? row.ngo_verifications[0]
      : row.ngo_verifications;
    if (isFieldOfficerAccount(row, profileData, ngoVerification)) {
      return false;
    }
    // All verified NGOs are listed; Razorpay connection only gates payments.
    return true;
  });

  const { projectCountByNgoId, platformProjectsByNgoId } = await loadPlatformProjects(rows.map((row) => row.id));

  return rows.map((row) => {
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
      city: row.city ?? null,
      state_province: row.state_province ?? null,
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
      csr_eligible: ngoIsCsrEligible(row.verification_status ?? ngoVerification?.verification_status, profileData),
      accepts_payments: complianceFlags.verified && routeReady,
    };

    return {
      ...mapped,
      search_haystack: buildSearchHaystack(row, profileData, ngoVerification, mapped, pastProjects),
    };
  });
}

export type NetworkNgo = NonNullable<Awaited<ReturnType<typeof loadNetworkNgos>>>[number];

export type NetworkNgoFilters = {
  search: string;
  location: string;
  sector: string;
  compliance: string;
  registrationType: string;
  verifiedOnly: boolean;
};

export function filterNetworkNgos(source: NetworkNgo[], filters: NetworkNgoFilters) {
  const { search, location, sector, compliance, registrationType, verifiedOnly } = filters;
  let ngos = source;

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

  return ngos.map(({ search_haystack, city, state_province, ...ngo }) => ngo);
}
