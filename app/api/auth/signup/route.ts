import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, generateToken, validateNgoHeadquartersLocation, validateCompanyHeadquartersLocation, normalizePincode, buildNgoLocationDisplay, normalizePhoneDigits, isPermanentlyBannedAccount } from '@/lib/auth';
import { supabase } from '@/lib/db';
import { setAuthTokenCookie } from '@/lib/server-auth';

const parseNumeric = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseInteger = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasMeaningfulValue = (value: unknown): boolean => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return value !== null && value !== undefined;
};


const validateProfileRequirements = (userType: 'individual' | 'ngo' | 'company', profile: Record<string, any>): string | null => {
  if (userType === 'ngo') {
    const requiredNgoFields: Array<{ key: string; label: string }> = [
      { key: 'registration_date', label: 'Registration Date' },
      { key: 'sectors_schedule_vii', label: 'Sectors Worked (Schedule VII)' },
      { key: 'team_strength', label: 'Team Strength' }
    ];

    for (const field of requiredNgoFields) {
      if (!hasMeaningfulValue(profile[field.key])) {
        return `${field.label} is required for NGO registration.`;
      }
    }

    const teamStrength = parseInteger(profile.team_strength);
    if (teamStrength === null || teamStrength <= 0) {
      return 'Team Strength must be a valid positive number for NGO registration.';
    }
  }

  return null;
};

// Validation schema for signup
const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  user_type: z.enum(['individual', 'ngo', 'company']),
  phone: z.string().optional(),
  city: z.string().optional(),
  state_province: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  location: z.string().optional(),
  profile_data: z.record(z.any()).optional(),
  ngo_volunteer_capacity: z.union([z.number().int(), z.string()]).optional()
});

const getFriendlySignupError = (error: unknown): string => {
  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : '';

  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('duplicate') || lowerMessage.includes('already exists')) {
    return 'An account with this email already exists. Please log in or use a different email.';
  }

  if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
    return 'We could not complete registration due to a network issue. Please try again.';
  }

  return 'We could not create your account right now. Please try again in a moment.';
};

export async function POST(req: NextRequest) {
  try {
    // Parse and validate request body
    const body = await req.json();
    const validationResult = signupSchema.safeParse(body);
    
    if (!validationResult.success) {
      const firstIssue = validationResult.error.issues[0];
      const validationMessage = firstIssue?.message || 'Please check your details and try again.';
      return NextResponse.json({
        error: validationMessage,
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }
    
    const { email, password, name, user_type, phone, city, state_province, pincode, country, location, profile_data, ngo_volunteer_capacity } = validationResult.data;
    const profile = profile_data || {};

    if (user_type === 'ngo') {
      const headquarters = (profile.ngo_headquarters && typeof profile.ngo_headquarters === 'object')
        ? profile.ngo_headquarters as Record<string, unknown>
        : {};

      const locationError = validateNgoHeadquartersLocation({
        address_line: String(headquarters.address_line || profile.registered_address || ''),
        city: city || String(headquarters.city || profile.city || ''),
        state: state_province || String(headquarters.state || profile.state || ''),
        pincode: pincode || String(headquarters.pincode || profile.pincode || ''),
        country: country || String(headquarters.country || profile.country || 'India'),
      });

      if (locationError) {
        return NextResponse.json({
          error: locationError,
          code: 'VALIDATION_ERROR',
        }, { status: 400 });
      }
    }

    if (user_type === 'company') {
      const headquarters = (profile.company_headquarters && typeof profile.company_headquarters === 'object')
        ? profile.company_headquarters as Record<string, unknown>
        : {};

      const locationError = validateCompanyHeadquartersLocation({
        address_line: String(headquarters.address_line || profile.registered_address || ''),
        city: city || String(headquarters.city || profile.city || ''),
        state: state_province || String(headquarters.state || profile.state || ''),
        pincode: pincode || String(headquarters.pincode || profile.pincode || ''),
        country: country || String(headquarters.country || profile.country || 'India'),
      });

      if (locationError) {
        return NextResponse.json({
          error: locationError,
          code: 'VALIDATION_ERROR',
        }, { status: 400 });
      }
    }

    const normalizedPincode =
      user_type === 'ngo' || user_type === 'company'
        ? normalizePincode(String(pincode || ''), country || 'India')
        : pincode;
    const parsedNgoCapacity = (() => {
      if (ngo_volunteer_capacity === undefined || ngo_volunteer_capacity === null) return null;
      if (typeof ngo_volunteer_capacity === 'number') return Math.max(0, Math.trunc(ngo_volunteer_capacity));
      const match = String(ngo_volunteer_capacity).trim().match(/\d+/);
      if (!match) return null;
      return Math.max(0, Number(match[0]));
    })();

    const profileValidationError = validateProfileRequirements(user_type, profile);
    if (profileValidationError) {
      return NextResponse.json({
        error: profileValidationError,
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }
    
    // Check if user already exists
    const existingUser = await db.users.findByEmail(email);
    
    if (existingUser) {
      if (isPermanentlyBannedAccount(existingUser)) {
        return NextResponse.json(
          { error: 'This email is permanently banned and cannot be used to create a new account.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }

    const phoneDigits = normalizePhoneDigits(phone);
    if (phoneDigits) {
      const [{ data: statusBanned }, { data: flagBanned }] = await Promise.all([
        supabase
          .from('users')
          .select('id, phone, account_status, profile_data')
          .in('account_status', ['banned', 'deactivated'])
          .limit(500),
        supabase
          .from('users')
          .select('id, phone, account_status, profile_data')
          .contains('profile_data', { admin_moderation: { permanently_banned: true } })
          .limit(500),
      ]);

      const bannedRows = [...(statusBanned || []), ...(flagBanned || [])];
      const bannedPhoneHit = bannedRows.some((row) => normalizePhoneDigits(row.phone) === phoneDigits);
      if (bannedPhoneHit) {
        return NextResponse.json(
          { error: 'This phone number is permanently banned and cannot be used to create a new account.' },
          { status: 403 }
        );
      }
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user with profile data
    const userData = {
      email,
      password: hashedPassword,
      name,
      user_type,
      email_verified: true,
      phone_verified: false,
      email_verified_at: new Date().toISOString(),
      phone_verified_at: null,
      phone,
      city,
      state_province,
      pincode: normalizedPincode,
      country,
      location: location || (user_type === 'ngo'
        ? buildNgoLocationDisplay({
            address_line: String((profile.ngo_headquarters as Record<string, unknown> | undefined)?.address_line || ''),
            city: city || '',
            state: state_province || '',
            pincode: String(normalizedPincode || ''),
            country: country || 'India',
          })
        : user_type === 'company'
          ? buildNgoLocationDisplay({
              address_line: String((profile.company_headquarters as Record<string, unknown> | undefined)?.address_line || ''),
              city: city || '',
              state: state_province || '',
              pincode: String(normalizedPincode || ''),
              country: country || 'India',
            })
          : undefined),
      profile_data: profile,
      // include top-level column if provided
      ...(parsedNgoCapacity !== null ? { ngo_volunteer_capacity: parsedNgoCapacity } : {})
    };
    
    const newUser = await db.users.create(userData);
    
    // Generate JWT token with verification status
    const user = {
      id: newUser.id,
      email,
      name,
      user_type,
      verification_status: 'unverified' as const,
      email_verified: true,
      phone_verified: false
    };
    
    const token = generateToken(user);
    
    // Return success response with token
    const response = NextResponse.json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        email,
        name,
        user_type,
        phone: newUser.phone || '',
        city: newUser.city || '',
        state_province: newUser.state_province || '',
        pincode: newUser.pincode || '',
        country: newUser.country || '',
        verification_status: 'unverified',
        email_verified: true,
        phone_verified: false,
        profile_data: newUser.profile_data || {},
        profile: newUser.profile_data || {},
        created_at: newUser.created_at
      },
      token
    }, { status: 201 });

    setAuthTokenCookie(response, token);

    return response;
    
  } catch (error: any) {
    console.error('Signup error:', error);

    const errorMessage = getFriendlySignupError(error);
    return NextResponse.json({ 
      error: errorMessage,
      code: 'SIGNUP_FAILED'
    }, { status: 500 });
  }
}