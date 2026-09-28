import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { comparePassword, generateToken, getAccountAccessBlockReason, type UserData } from '@/lib/auth';
import { isCompanyCAUser } from '@/lib/company-ca';
import { setAuthTokenCookie } from '@/lib/server-auth';
import { limitAttempts } from '@/lib/rate-limit';

// Validation schema for login
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = loginSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ error: validationResult.error.errors }, { status: 400 });
    }
    
    const { email, password } = validationResult.data;

    const limited = await limitAttempts(req, 'login', email);
    if (limited) return limited;
    
    const user = await db.users.findByEmail(email);
    
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const isPasswordValid = await comparePassword(password, user.password);
    
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (await isCompanyCAUser(user.id)) {
      return NextResponse.json(
        { error: 'This account is restricted to the CA Portal. Use /evidence-verification/login.' },
        { status: 403 }
      );
    }

    const accessBlock = getAccountAccessBlockReason({
      account_status: user.account_status,
      locked_until: user.locked_until,
      profile_data: user.profile_data,
    });
    if (accessBlock) {
      return NextResponse.json({ error: accessBlock }, { status: 403 });
    }
    
    const userData: UserData = {
      id: user.id,
      email: user.email,
      name: user.name,
      user_type: user.user_type as UserData['user_type'],
      verification_status: (user.verification_status || 'unverified') as UserData['verification_status'],
      email_verified: user.email_verified || false,
      phone_verified: user.phone_verified || false
    };

    const token = generateToken(userData);
    const response = NextResponse.json({
      message: 'Login successful',
      user: userData,
      token
    });
    
    setAuthTokenCookie(response, token);
    
    return response;
    
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ 
      error: 'Something went wrong during login'
    }, { status: 500 });
  }
}