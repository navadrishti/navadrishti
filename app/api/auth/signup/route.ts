import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { executeQuery, initializeDatabase } from '@/lib/db';
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
    // Make sure database is initialized
    await initializeDatabase();
    
    // Parse and validate request body
    const body = await req.json();
    const validationResult = signupSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ error: validationResult.error.errors }, { status: 400 });
    }
    
    const { email, password, name, user_type, profile_data } = validationResult.data;
    
    // Check if user already exists
    const existingUser = await executeQuery({
      query: 'SELECT * FROM users WHERE email = ?',
      values: [email]
    }) as any[];
    
    if (existingUser.length > 0) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user
    const result = await executeQuery({
      query: 'INSERT INTO users (email, password, name, user_type) VALUES (?, ?, ?, ?)',
      values: [email, hashedPassword, name, user_type]
    }) as any;
    
    const userId = result.insertId;
    
    // Add profile data if provided
    if (profile_data) {
      await executeQuery({
        query: 'INSERT INTO user_profiles (user_id, profile_data) VALUES (?, ?)',
        values: [userId, JSON.stringify(profile_data)]
      });
    }
    
    // Generate JWT token
    const user = {
      id: userId,
      email,
      name,
      user_type
    };
    
    const token = generateToken(user);
    
    // Return success response with token
    return NextResponse.json({
      message: 'User registered successfully',
      user: {
        id: userId,
        email,
        name,
        user_type
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