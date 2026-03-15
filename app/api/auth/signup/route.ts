import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, generateToken } from '@/lib/auth';

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
    
    // Check if user already exists
    const existingUser = await db.users.findByEmail(email);
    
    if (existingUser) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
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
      phone_verified: true,
      email_verified_at: new Date().toISOString(),
      phone_verified_at: new Date().toISOString(),
      phone,
      city,
      state_province,
      pincode,
      country,
      profile_data: profile_data || {}
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
      phone_verified: true
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
        verification_status: 'unverified',
        email_verified: true,
        phone_verified: true,
        profile_data: newUser.profile_data || {}
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