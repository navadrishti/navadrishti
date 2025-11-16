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
  profile_data: z.record(z.any()).optional()
});

export async function POST(req: NextRequest) {
  try {
    // Parse and validate request body
    const body = await req.json();
    const validationResult = signupSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ error: validationResult.error.errors }, { status: 400 });
    }
    
    const { email, password, name, user_type, profile_data } = validationResult.data;
    
    // Check if user already exists
    const existingUser = await db.users.findByEmail(email);
    
    if (existingUser) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user
    const userData = {
      email,
      password: hashedPassword,
      name,
      user_type
    };
    
    const newUser = await db.users.create(userData);
    
    // Add profile data if provided (skip for now, can be added to user_profiles table later)
    if (profile_data && newUser.id) {
      // Note: userProfiles helper not implemented yet, can be added if needed
      console.log('Profile data provided but not stored:', profile_data);
    }
    
    // Generate JWT token with verification status
    const user = {
      id: newUser.id,
      email,
      name,
      user_type,
      verification_status: 'unverified' as const,
      email_verified: false,
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
        verification_status: 'unverified',
        email_verified: false,
        phone_verified: false
      },
      token
    }, { status: 201 });
    
  } catch (error: any) {
    console.error('Signup error:', error);
    // Provide more specific error message when possible
    const errorMessage = error.message || 'Something went wrong during signup';
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
    }, { status: 500 });
  }
}