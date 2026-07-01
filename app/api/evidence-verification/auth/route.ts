import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, supabase } from '@/lib/db';
import { comparePassword, generateToken } from '@/lib/auth';
import { ensureCompanyCaIdAssigned } from '@/lib/company-ca-id-helper';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid credentials' }, { status: 400 });
    }

    const { email, password } = parsed.data;

    const user = await db.users.findByEmail(email);
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const validPassword = await comparePassword(password, user.password);
    if (!validPassword) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const { data: identity, error: identityError } = await supabase
      .from('company_ca_identities')
      .select('id, user_id, company_user_id, ca_id, status, permissions, must_change_password')
      .eq('user_id', user.id)
      .single();

    if (identityError || !identity) {
      return NextResponse.json({ error: 'This account is not authorized for the evidence verification portal' }, { status: 403 });
    }

    if (identity.status !== 'active') {
      return NextResponse.json({ error: 'This verification account is inactive' }, { status: 403 });
    }

    const caId = await ensureCompanyCaIdAssigned(identity.id, identity.company_user_id, identity.ca_id);

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      user_type: user.user_type,
      verification_status: user.verification_status || 'verified',
      email_verified: user.email_verified || false,
      phone_verified: user.phone_verified || false
    });

    await supabase
      .from('company_ca_identities')
      .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', identity.id);

    const response = NextResponse.json({
      success: true,
      role: 'company_ca',
      token,
      must_change_password: identity.must_change_password || false,
      company_ca: {
        identity_id: identity.id,
        ca_id: caId,
        company_user_id: identity.company_user_id,
        permissions: identity.permissions ?? {},
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        }
      }
    });

    response.cookies.set('evidence-verification-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    return response;
  } catch (error) {
    console.error('Company CA login error:', error);
    return NextResponse.json({ error: 'Failed to login company CA' }, { status: 500 });
  }
}
