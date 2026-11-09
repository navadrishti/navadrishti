import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { comparePassword, generateToken, getAccountAccessBlockReason, type UserData } from '@/lib/auth';
import { isCompanyCAUser } from '@/lib/company-ca';
import {
  evaluateCompanyEmployeeAuthentication,
  touchCompanyEmployeeLastLogin,
} from '@/lib/company-employee';
import { isNgoFieldOfficerUser } from '@/lib/ngo-field-officer';
import { setAuthTokenCookie } from '@/lib/server-auth';
import { limitAttempts } from '@/lib/rate-limit';
import { zodIssuesToUserMessage } from '@/lib/user-facing-error';

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
      return NextResponse.json({ error: zodIssuesToUserMessage(validationResult.error.issues) }, { status: 400 });
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

    // Field Officers must not obtain main-platform NGO/company sessions.
    if (await isNgoFieldOfficerUser(user.id)) {
      return NextResponse.json(
        { error: 'This account cannot sign in to the main platform.' },
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

    const employeeEval = await evaluateCompanyEmployeeAuthentication(user.id, {
      allowPasswordChangePending: true,
    });
    if (employeeEval.isEmployee && !employeeEval.allowed) {
      return NextResponse.json(
        { error: employeeEval.reason || 'This account cannot sign in.' },
        { status: 403 }
      );
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

    if (employeeEval.isEmployee && employeeEval.allowed) {
      await touchCompanyEmployeeLastLogin(employeeEval.identity.id);
    }

    const token = generateToken(userData);
    const response = NextResponse.json({
      message: 'Login successful',
      user: {
        ...userData,
        ...(employeeEval.isEmployee
          ? {
              profile_data: {
                role: 'company_employee',
                parent_company_user_id: employeeEval.identity.company_user_id,
              },
              must_change_password: employeeEval.mustChangePassword,
              is_company_employee: true,
            }
          : {}),
      },
      token,
      ...(employeeEval.isEmployee
        ? {
            is_company_employee: true,
            must_change_password: employeeEval.mustChangePassword,
            redirect_to: employeeEval.mustChangePassword
              ? '/employees/change-password'
              : '/employees/dashboard',
          }
        : {}),
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