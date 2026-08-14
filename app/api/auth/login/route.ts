import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { comparePassword, generateToken } from '@/lib/auth';
import { isCompanyCAUser } from '@/lib/company-ca';

// Validation schema for login
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export async function POST(req: NextRequest) {
  try {
    // Parse and validate request body
    const body = await req.json();
    const validationResult = loginSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ error: validationResult.error.errors }, { status: 400 });
    }
    
    const { email, password } = validationResult.data;
    
    // Fetch user from database using Supabase
    const user = await db.users.findByEmail(email);
    
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (await isCompanyCAUser(user.id)) {
      return NextResponse.json(
        { error: 'This account is restricted to the Evidence Verification Portal. Use /evidence-verification/login.' },
        { status: 403 }
      );
    }
    
    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }
    
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      user_type: user.user_type,
      verification_status: user.verification_status || 'unverified',
      email_verified: user.email_verified || false,
      phone_verified: user.phone_verified || false
    };

    const token = generateToken(userData);
    const response = NextResponse.json({
      message: 'Login successful',
      user: userData,
      token
    });
    
    // Set cookie with token (for web clients)
    response.cookies.set({
      name: 'token',
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    });
    
    return response;
    
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ 
      error: 'Something went wrong during login'
    }, { status: 500 });
  }
}