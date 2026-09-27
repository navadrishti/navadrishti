export type FormErrors = Record<string, string>

export type ProfileData = Record<string, unknown>

export type FetchedProfileUser = {
  name?: string | null
  email?: string | null
  phone?: string | null
  email_verified?: boolean | null
  phone_verified?: boolean | null
  user_type?: string | null
  city?: string | null
  state_province?: string | null
  pincode?: string | null
  country?: string | null
  bio?: string | null
  profile_image?: string | null
  cover_image?: string | null
  ngo_volunteer_capacity?: number | string | null
  profile_data?: ProfileData | null
}

export type ProfileIdentityFields = {
  name: string
  email: string
  phone: string
  profileImageUrl: string
  coverImageUrl: string
}

export type ProfileUpdatePayload = ProfileIdentityFields & {
  city: string
  state_province: string
  pincode: string
  country: string
  bio: string
  profile_data: ProfileData
  location?: string
  ngo_volunteer_capacity?: number
}
