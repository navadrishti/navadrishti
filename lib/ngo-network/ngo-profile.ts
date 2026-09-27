import {
  PHONE_VERIFICATION_ENABLED,
  backfillNgoComplianceProfileData,
  formatGeographicCoverageForSearch,
  formatPastProjectsForSearch,
  getCaComplianceTags,
  summarizeGeographicCoverage,
} from '@/lib/auth';
import { normalizeCompanyFocusAreasScheduleVii } from '@/lib/categories';
import { parseJsonObject } from '@/lib/utils';

export function isFieldOfficerAccount(
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

export function getEffectiveNgoProfileData(value: unknown): Record<string, unknown> {
  return backfillNgoComplianceProfileData(parseJsonObject(value)).profileData;
}

export function getNgoSize(profileData: Record<string, unknown>) {
  const size = profileData.team_strength ?? profileData.organization_size ?? null;
  if (size === null || size === undefined) return null;
  const text = String(size).trim();
  return text || null;
}

export function buildMission(profileData: Record<string, unknown>) {
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

export function normalizeProjectStatus(status: unknown): 'completed' | 'ongoing' | 'active' {
  const value = String(status || '').trim().toLowerCase();
  if (['completed', 'fulfilled', 'closed'].includes(value)) return 'completed';
  if (['in_progress', 'ongoing', 'assigned'].includes(value)) return 'ongoing';
  return 'active';
}

export function listNgoScheduleViiSectors(
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

export function normalizeNgoRegistrationType(value: unknown): 'Trust' | 'Society' | 'Section 8' | '' {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text.includes('trust')) return 'Trust';
  if (text.includes('society')) return 'Society';
  if (text.includes('section 8') || text.includes('section8') || text.includes('company limited')) {
    return 'Section 8';
  }
  return '';
}

export function buildCompliance(
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

export function buildSearchHaystack(
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
