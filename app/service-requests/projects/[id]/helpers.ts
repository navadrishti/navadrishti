import { formatStatusLabel } from '@/lib/format-date';
import type { CompanyApplication, NeedItem, ProjectDetail, ProjectDetailPayload } from './types';

export function mergeOwnApplication(payload: ProjectDetailPayload, application: CompanyApplication): ProjectDetailPayload {
  const others = (payload.company_applications || []).filter(
    (item) => Number(item.company_id) !== Number(application.company_id)
  )
  const project = payload.project
    ? {
        ...payload.project,
        pending_company_applications: [
          ...(payload.project.pending_company_applications || []).filter(
            (item) => Number(item.company_id) !== Number(application.company_id)
          ),
          { company_id: application.company_id, status: application.status },
        ],
      }
    : payload.project
  return { ...payload, project, company_applications: [...others, application] }
}

export function keepOwnApplication(
  previous: ProjectDetailPayload | null,
  next: ProjectDetailPayload,
  companyId: number | undefined,
  userType: string | undefined,
  sticky: CompanyApplication | null = null,
): ProjectDetailPayload {
  if (userType !== 'company' || !companyId) return next

  const incomingListed = (next.company_applications || []).find(
    (item) => Number(item.company_id) === Number(companyId)
  )
  if (incomingListed) return next

  const incomingMeta = (next.project?.pending_company_applications || []).find(
    (item) => Number(item.company_id) === Number(companyId)
  )
  if (incomingMeta) {
    return mergeOwnApplication(next, {
      company_id: Number(incomingMeta.company_id),
      status: String(incomingMeta.status || 'pending'),
      needs: [],
    })
  }

  const mine =
    (previous?.company_applications || []).find((item) => Number(item.company_id) === Number(companyId)) || sticky
  if (mine) return mergeOwnApplication(next, mine)
  return next
}

export function readReturnedApplication(payload: unknown, companyId: number | undefined): CompanyApplication | null {
  if (!payload || typeof payload !== 'object' || !companyId) return null
  const root = payload as { application?: unknown; data?: { application?: unknown } }
  const raw = root.application || root.data?.application
  if (!raw || typeof raw !== 'object') return null
  const row = raw as { company_id?: unknown; status?: unknown; needs?: unknown }
  return {
    company_id: Number(row.company_id || companyId),
    status: String(row.status || 'pending'),
    needs: Array.isArray(row.needs) ? (row.needs as CompanyApplication['needs']) : [],
  }
}

export function applicationStatusCopy(status: string) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'accepted') {
    return 'The NGO accepted your takeover. Invite a lead NGO from the Company Dashboard.'
  }
  if (normalized === 'rejected') {
    return 'The NGO declined this takeover application.'
  }
  if (normalized === 'expired' || normalized === 'cancelled') {
    return 'This takeover application is no longer active.'
  }
  if (normalized === 'pending' || normalized === 'pledged') {
    return 'Your takeover application is waiting for the NGO to review.'
  }
  return `Your company has already applied for this project (${formatStatusLabel(normalized)}).`
}

export function canReapplyForTakeover(status: string) {
  return ['rejected', 'expired', 'cancelled'].includes(String(status || '').toLowerCase())
}

export const statusBadgeClass = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') return 'border-[#D5E2DA] bg-[#F1F6F3] text-[#4F6B5C]';
  if (normalized === 'in_progress' || normalized === 'active') return 'border-[#D9E0E4] bg-[#F0F3F4] text-udaan-blue';
  if (normalized === 'accepted') return 'border-[#D5E2DA] bg-[#F1F6F3] text-[#4F6B5C]';
  if (normalized === 'pending' || normalized === 'pledged') return 'border-[#E9DFCC] bg-[#F8F4EC] text-[#8A6F45]';
  if (normalized === 'cancelled' || normalized === 'rejected' || normalized === 'expired') return 'border-[#E8D8D8] bg-[#F8F1F1] text-[#8C5555]';
  return 'border-gram-border bg-gram-page text-gram-muted';
};

export const getInitials = (name?: string) => {
  if (!name) return 'NG';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'NG';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export const getNeedImage = (need: NeedItem) =>
  Array.isArray(need.images) && need.images.length > 0 ? need.images[0] : need.image_url || '';

export function resolveProject(payload: ProjectDetailPayload, projectId: string): ProjectDetail {
  if (payload.project) return payload.project;

  const primaryNeed = payload.needs[0] || null;
  return {
    id: projectId,
    ngo_id: Number(primaryNeed?.ngo_id || 0),
    title: primaryNeed?.title || 'Project',
    description: primaryNeed?.description || '',
    location: primaryNeed?.location || 'Location not set',
    exact_address: primaryNeed?.location || 'Location not set',
    timeline: primaryNeed?.timeline || '',
    status: 'active',
    ngo: undefined
  };
}

export function resolveProjectCategory(project: ProjectDetail, needs: NeedItem[]) {
  return project.category
    || needs.map((need) => String(need.category || '').trim()).find(Boolean)
    || 'Not set';
}

export function summarizeNgo(project: ProjectDetail) {
  const ngo = project.ngo;
  const profileData: Record<string, unknown> = ngo?.profile_data || {};
  const volunteerCapacity = profileData.ngo_volunteer_capacity;

  const location = ngo?.city && ngo?.state_province
    ? `${ngo.city}, ${ngo.state_province}${ngo.country ? `, ${ngo.country}` : ''}`
    : ngo?.location || project.exact_address || project.location || 'Location not set';

  const size =
    typeof ngo?.ngo_volunteer_capacity === 'number' && ngo.ngo_volunteer_capacity >= 0
      ? `${ngo.ngo_volunteer_capacity} people`
      : typeof volunteerCapacity === 'number' && volunteerCapacity >= 0
        ? `${volunteerCapacity} people`
        : 'NGO size not set';

  return {
    name: ngo?.name || 'NGO',
    email: ngo?.email || null,
    verificationStatus: ngo?.verification_status,
    location,
    phone: ngo?.phone || null,
    size,
    sector: String(profileData.sector || ngo?.industry || 'Sector not set'),
    founded: String(profileData.founded || profileData.founded_year || 'Founded year not set'),
    pincode: ngo?.pincode || 'Pincode not set',
    profileImage: String(profileData.profile_image || profileData.logo_url || ngo?.profile_image || '').trim(),
  };
}

export type NgoSummary = ReturnType<typeof summarizeNgo>;
