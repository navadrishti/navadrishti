import { buildNgoLocationDisplay } from '@/lib/auth';
import { parseJsonObject } from '@/lib/utils';
import type { Json, Tables, TablesUpdate } from '@/lib/database.types';

const SERVER_OWNED_PROFILE_KEYS = [
  'ca_badge_number',
  'ca_verified_at',
  'ca_verified_by',
  'ca_compliance_tags',
  'allotted_compliance_tags',
  'admin_moderation',
  'reverification_pending',
  'verification_documents',
  'compliance_documents',
  'twelve_a_number',
  'eighty_g_number',
  'csr1_registration_number',
  'fcra_number',
  'fcra_expiry_date',
  'document_expiries',
  'document_expiry_unverified_at',
  'document_expiry_unverified_docs',
  'volunteering_history',
  'payout_account',
  'payout_details_on_file',
  'payout_listing',
  'payout_listings',
  'payout_listing_activated_at',
  'payout_listing_activation_source',
  'razorpay_account_id',
  'razorpay_linked_account_id',
  'razorpay_route_account_id',
  'razorpay_route_product_id',
  'razorpay_link_status',
  'razorpay_link_error',
  'razorpay_link_updated_at',
];

export function stripServerOwnedProfileKeys<T extends Record<string, unknown>>(profileData: T): T {
  const next = { ...profileData };
  for (const key of SERVER_OWNED_PROFILE_KEYS) delete next[key];
  return next;
}

export type ProfileUpdateBody = {
  name?: string;
  email?: string;
  profileImageUrl?: string | null;
  coverImageUrl?: unknown;
  city?: string | null;
  state_province?: string | null;
  pincode?: string | null;
  country?: string | null;
  phone?: string | null;
  bio?: Json;
  location?: string | null;
  timezone?: string | null;
  ngo_volunteer_capacity?: unknown;
  profile_data?: Record<string, Json | undefined> | null;
};

type CurrentProfileRow = Pick<
  Tables<'users'>,
  'email' | 'phone' | 'profile_data' | 'user_type' | 'city' | 'state_province' | 'pincode' | 'country'
>;

export function parseVolunteerCapacity(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') return Math.trunc(raw);
  const digits = String(raw).match(/\d+/);
  return digits ? Number(digits[0]) : null;
}

export function isPhoneChanged(next: unknown, current: string | null | undefined) {
  return String(next).replace(/\s+/g, '') !== String(current || '').replace(/\s+/g, '');
}

function mergeProfileData(body: ProfileUpdateBody, currentUser: CurrentProfileRow | null) {
  const { bio, profile_data, coverImageUrl } = body;

  let nextProfileData: Record<string, Json | undefined> | undefined;
  if (profile_data && typeof profile_data === 'object') {
    const currentProfileData = parseJsonObject(currentUser?.profile_data);
    const incomingProfileData = stripServerOwnedProfileKeys(profile_data);
    if (currentUser?.user_type === 'ngo') {
      delete incomingProfileData.past_projects;
    }
    const newProfileData = { ...currentProfileData, ...incomingProfileData };
    if (bio !== undefined) {
      newProfileData.bio = bio;
    }
    nextProfileData = newProfileData;
  } else if (bio !== undefined) {
    const currentProfileData = parseJsonObject(currentUser?.profile_data);
    nextProfileData = { ...currentProfileData, bio };
  }

  if (coverImageUrl !== undefined) {
    const currentProfileData = nextProfileData || parseJsonObject(currentUser?.profile_data);
    nextProfileData = {
      ...currentProfileData,
      cover_image: typeof coverImageUrl === 'string' ? coverImageUrl.trim() : '',
    };
  }

  return nextProfileData;
}

function shouldRebuildOrgLocation(body: ProfileUpdateBody, currentUser: CurrentProfileRow | null) {
  const { city, state_province, pincode, country, location, profile_data } = body;
  return (
    (currentUser?.user_type === 'ngo' || currentUser?.user_type === 'company') &&
    location === undefined &&
    (city !== undefined ||
      state_province !== undefined ||
      pincode !== undefined ||
      country !== undefined ||
      (profile_data &&
        typeof profile_data === 'object' &&
        ((profile_data.ngo_headquarters && typeof profile_data.ngo_headquarters === 'object') ||
          (profile_data.company_headquarters && typeof profile_data.company_headquarters === 'object'))))
  );
}

export function buildProfileUpdate(
  body: ProfileUpdateBody,
  currentUser: CurrentProfileRow | null
): TablesUpdate<'users'> {
  const { name, email, profileImageUrl, city, state_province, pincode, country, phone, location, timezone } = body;

  const updateData: TablesUpdate<'users'> = {};
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (profileImageUrl !== undefined) updateData.profile_image = profileImageUrl;
  if (city !== undefined) updateData.city = city;
  if (state_province !== undefined) updateData.state_province = state_province;
  if (pincode !== undefined) updateData.pincode = pincode;
  if (country !== undefined) updateData.country = country;
  if (phone !== undefined) updateData.phone = phone;
  if (location !== undefined) updateData.location = location;
  if (timezone !== undefined) updateData.timezone = timezone;

  const capacity = parseVolunteerCapacity(body.ngo_volunteer_capacity);
  if (capacity !== null) {
    updateData.ngo_volunteer_capacity = capacity;
  }

  if (email !== undefined && String(email).trim().toLowerCase() !== String(currentUser?.email || '').trim().toLowerCase()) {
    updateData.email_verified = false;
    updateData.email_verified_at = null;
  }
  if (phone !== undefined && isPhoneChanged(phone, currentUser?.phone)) {
    updateData.phone_verified = false;
    updateData.phone_verified_at = null;
  }

  const nextProfileData = mergeProfileData(body, currentUser);
  if (nextProfileData) updateData.profile_data = nextProfileData;

  if (shouldRebuildOrgLocation(body, currentUser)) {
    const mergedProfile = nextProfileData || parseJsonObject(currentUser?.profile_data);
    const headquartersKey = currentUser?.user_type === 'company' ? 'company_headquarters' : 'ngo_headquarters';
    const headquarters =
      mergedProfile[headquartersKey] && typeof mergedProfile[headquartersKey] === 'object'
        ? (mergedProfile[headquartersKey] as Record<string, unknown>)
        : {};

    updateData.location = buildNgoLocationDisplay({
      address_line: String(headquarters.address_line || ''),
      city: String(city ?? currentUser?.city ?? ''),
      state: String(state_province ?? currentUser?.state_province ?? ''),
      pincode: String(pincode ?? currentUser?.pincode ?? ''),
      country: String(country ?? currentUser?.country ?? 'India'),
    });
  }

  return updateData;
}
