import type { NeedItem, ProjectDetail, ProjectDetailPayload } from './types';

export const statusBadgeClass = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') return 'border-[#D5E2DA] bg-[#F1F6F3] text-[#4F6B5C]';
  if (normalized === 'in_progress' || normalized === 'active') return 'border-[#D9E0E4] bg-[#F0F3F4] text-udaan-blue';
  if (normalized === 'pending' || normalized === 'accepted') return 'border-[#E9DFCC] bg-[#F8F4EC] text-[#8A6F45]';
  if (normalized === 'cancelled' || normalized === 'rejected') return 'border-[#E8D8D8] bg-[#F8F1F1] text-[#8C5555]';
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
    email: ngo?.email || 'Email not set',
    verificationStatus: ngo?.verification_status,
    location,
    phone: ngo?.phone || 'Phone not set',
    size,
    sector: String(profileData.sector || ngo?.industry || 'Sector not set'),
    founded: String(profileData.founded || profileData.founded_year || 'Founded year not set'),
    pincode: ngo?.pincode || 'Pincode not set',
    profileImage: String(profileData.profile_image || profileData.logo_url || '').trim(),
  };
}

export type NgoSummary = ReturnType<typeof summarizeNgo>;
