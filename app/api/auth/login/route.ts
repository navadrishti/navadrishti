import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { executeQuery, initializeDatabase } from '@/lib/db';
import { comparePassword, generateToken } from '@/lib/auth';

// Validation schema for login
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export async function POST(req: NextRequest) {
  try {
    // Ensure database is initialized
    await initializeDatabase();
    
    // Parse and validate request body
    const body = await req.json();
    const validationResult = loginSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ error: validationResult.error.errors }, { status: 400 });
    }
    
    const { email, password } = validationResult.data;
    
    // Fetch user from database
    const users = await executeQuery({
      query: 'SELECT * FROM users WHERE email = ?',
      values: [email]
    }) as any[];
    
    if (users.length === 0) {
      // No user found with this email
      console.log(`Login attempt failed: No user found with email ${email}`);
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }
    
    const user = users[0];
    
    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    
    if (!isPasswordValid) {
      // Password doesn't match
      console.log(`Login attempt failed: Invalid password for user ${email}`);
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }
    
    // Generate JWT token
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      user_type: user.user_type
    };
    
    const token = generateToken(userData);
    console.log(`User ${email} logged in successfully`);
    
    // Create response with cookie
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