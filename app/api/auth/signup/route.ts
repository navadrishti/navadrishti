import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, generateToken } from '@/lib/auth';
import { stripDedicatedProfileData } from '@/lib/profile-storage';

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

const firstNonEmptyString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
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
      { key: 'twelve_a_number', label: '12A Number' },
      { key: 'eighty_g_number', label: '80G Number' },
      { key: 'csr1_registration_number', label: 'CSR-1 Registration Number' },
      { key: 'bank_details', label: 'Bank Details' },
      { key: 'sectors_schedule_vii', label: 'Sectors Worked (Schedule VII Mapped)' },
      { key: 'past_projects', label: 'Past Projects' },
      { key: 'geographic_coverage', label: 'Geographic Coverage' },
      { key: 'execution_capacity', label: 'Execution Capacity' },
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

  if (userType === 'company') {
    const requiredCompanyFields: Array<{ key: string; label: string }> = [
      { key: 'net_worth', label: 'Net Worth' },
      { key: 'turnover', label: 'Turnover' },
      { key: 'net_profit', label: 'Net Profit' },
      { key: 'csr_vision', label: 'CSR Vision' },
      { key: 'focus_areas_schedule_vii', label: 'Focus Areas (Schedule VII Mapped)' },
      { key: 'implementation_model', label: 'Implementation Model' },
      { key: 'governance_mechanism', label: 'Governance Mechanism' }
    ];

    for (const field of requiredCompanyFields) {
      if (!hasMeaningfulValue(profile[field.key])) {
        return `${field.label} is required for Company registration.`;
      }
    }

    const netWorth = parseNumeric(profile.net_worth);
    const turnover = parseNumeric(profile.turnover);
    const netProfit = parseNumeric(profile.net_profit);

    if (netWorth === null || netWorth < 0) {
      return 'Net Worth must be a valid non-negative number for Company registration.';
    }
    if (turnover === null || turnover < 0) {
      return 'Turnover must be a valid non-negative number for Company registration.';
    }
    if (netProfit === null) {
      return 'Net Profit must be a valid number for Company registration.';
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
  profile_data: z.record(z.any()).optional()
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
    
    const { email, password, name, user_type, phone, city, state_province, pincode, country, profile_data } = validationResult.data;
    const profile = profile_data || {};

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
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    const profileDataForStorage = stripDedicatedProfileData(user_type, profile);

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
      pincode,
      country,
      // Existing top-level profile fields already present on users
      industry: typeof profile.industry === 'string' ? profile.industry : null,
      website: typeof profile.website === 'string' ? profile.website : null,
      company_size: typeof profile.company_size === 'string' ? profile.company_size : null,
      ngo_size: typeof profile.ngo_size === 'string' ? profile.ngo_size : null,

      // NGO registration fields (new users columns)
      ngo_registration_type: firstNonEmptyString(profile.ngo_registration_type, profile.registration_type),
      ngo_registration_number: firstNonEmptyString(profile.ngo_registration_number, profile.registration_number),
      ngo_registration_date: typeof firstNonEmptyString(profile.registration_date) === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(firstNonEmptyString(profile.registration_date) || '')
        ? firstNonEmptyString(profile.registration_date)
        : null,
      ngo_pan_number: firstNonEmptyString(profile.ngo_pan_number, profile.pan_number),
      ngo_12a_number: firstNonEmptyString(profile.twelve_a_number),
      ngo_80g_number: firstNonEmptyString(profile.eighty_g_number),
      ngo_csr1_registration_number: firstNonEmptyString(profile.csr1_registration_number),
      ngo_fcra_applicable: Boolean(profile.ngo_fcra_applicable),
      ngo_fcra_number: firstNonEmptyString(profile.ngo_fcra_number, profile.fcra_number),
      ngo_bank_details: typeof profile.bank_details === 'string' && profile.bank_details.trim().length > 0
        ? { summary: profile.bank_details }
        : (typeof profile.bank_details === 'object' && profile.bank_details !== null ? profile.bank_details : {}),
      ngo_sectors_schedule_vii: typeof profile.sectors_schedule_vii === 'string' && profile.sectors_schedule_vii.trim().length > 0
        ? [profile.sectors_schedule_vii]
        : (Array.isArray(profile.sectors_schedule_vii) ? profile.sectors_schedule_vii : []),
      ngo_past_projects: typeof profile.past_projects === 'string' && profile.past_projects.trim().length > 0
        ? [profile.past_projects]
        : (Array.isArray(profile.past_projects) ? profile.past_projects : []),
      ngo_geographic_coverage: typeof profile.geographic_coverage === 'string' && profile.geographic_coverage.trim().length > 0
        ? [profile.geographic_coverage]
        : (Array.isArray(profile.geographic_coverage) ? profile.geographic_coverage : []),
      ngo_execution_capacity: firstNonEmptyString(profile.execution_capacity),
      ngo_team_strength: parseInteger(profile.team_strength),

      // Company registration fields (new users columns)
      company_cin_number: firstNonEmptyString(profile.company_cin_number, profile.cin_number),
      company_pan_number: firstNonEmptyString(profile.company_pan_number, profile.pan_number),
      company_net_worth: parseNumeric(profile.net_worth),
      company_turnover: parseNumeric(profile.turnover),
      company_net_profit: parseNumeric(profile.net_profit),
      company_csr_vision: firstNonEmptyString(profile.csr_vision),
      company_focus_areas_schedule_vii: typeof profile.focus_areas_schedule_vii === 'string' && profile.focus_areas_schedule_vii.trim().length > 0
        ? [profile.focus_areas_schedule_vii]
        : (Array.isArray(profile.focus_areas_schedule_vii) ? profile.focus_areas_schedule_vii : []),
      company_implementation_model: firstNonEmptyString(profile.implementation_model),
      company_governance_mechanism: firstNonEmptyString(profile.governance_mechanism),

      profile_data: profileDataForStorage
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
    return NextResponse.json({
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
    
  } catch (error: any) {
    console.error('Signup error:', error);

    const errorMessage = getFriendlySignupError(error);
    return NextResponse.json({ 
      error: errorMessage,
      code: 'SIGNUP_FAILED'
    }, { status: 500 });
  }
}