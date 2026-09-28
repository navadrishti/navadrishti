import { z } from 'zod';
import { supabase } from '@/lib/db';
import { parseJsonObject } from '@/lib/utils';
import type { Tables, TablesUpdate } from '@/lib/database.types';
import { isPhoneChanged, parseVolunteerCapacity } from './profile-fields';

// Validation schema for PUT request (authenticated users updating their own profile)
export const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters').optional(),
  profileImageUrl: z.string().url().optional(),
  city: z.string().optional(),
  state_province: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
  skills: z.string().optional(),
  interests: z.string().optional(),
  ngo_volunteer_capacity: z.union([z.number().int(), z.string()]).optional()
});

export function normalizeProfileForm(data: z.infer<typeof updateProfileSchema>) {
  const { ngo_volunteer_capacity: rawCapacity, ...updateData } = data;
  const ngoVolunteerCapacity = parseVolunteerCapacity(rawCapacity) ?? undefined;

  const cleanUpdateData: Partial<typeof updateData> & { ngo_volunteer_capacity?: number } =
    Object.fromEntries(
      Object.entries({ ...updateData, ngo_volunteer_capacity: ngoVolunteerCapacity }).filter(([, value]) => value !== undefined)
    );

  return cleanUpdateData;
}

type ProfileFormData = ReturnType<typeof normalizeProfileForm>;

function buildProfileFormUpdate(
  cleanUpdateData: ProfileFormData,
  currentUser: Pick<Tables<'users'>, 'phone' | 'profile_data'>
): TablesUpdate<'users'> {
  const { skills, interests, bio, profileImageUrl, ...directUserFields } = cleanUpdateData;

  const updatedProfileData = parseJsonObject(currentUser.profile_data);

  // Only update profile_data fields that were provided
  if (skills !== undefined) updatedProfileData.skills = skills;
  if (interests !== undefined) updatedProfileData.interests = interests;
  if (bio !== undefined) updatedProfileData.bio = bio;

  const finalUpdateData: TablesUpdate<'users'> = {
    ...directUserFields,
    profile_data: updatedProfileData,
    updated_at: new Date().toISOString()
  };
  if (profileImageUrl !== undefined) finalUpdateData.profile_image = profileImageUrl;
  if (directUserFields.phone !== undefined && isPhoneChanged(directUserFields.phone, currentUser.phone)) {
    finalUpdateData.phone_verified = false;
    finalUpdateData.phone_verified_at = null;
  }

  return finalUpdateData;
}

export async function saveProfileForm(userId: number, cleanUpdateData: ProfileFormData) {
  const { data: currentUser, error: fetchError } = await supabase
    .from('users')
    .select('phone, profile_data')
    .eq('id', userId)
    .single();

  if (fetchError || !currentUser) {
    return { status: 'fetch_failed' as const };
  }

  const { data, error } = await supabase
    .from('users')
    .update(buildProfileFormUpdate(cleanUpdateData, currentUser))
    .eq('id', userId)
    .select('id, email, name, user_type, profile_image, city, state_province, pincode, country, phone, profile_data, location, timezone');

  if (error) {
    return { status: 'update_failed' as const, error };
  }

  if (!data || data.length === 0) {
    return { status: 'not_found' as const };
  }

  const user = data[0];
  const profileData = parseJsonObject(user.profile_data);

  return {
    status: 'ok' as const,
    user: {
      ...user,
      skills: profileData.skills || '',
      interests: profileData.interests || ''
    },
  };
}
