import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase, db } from '@/lib/db';
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth';
import { hashPassword } from '@/lib/auth';

const createCompanyCASchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  permissions: z.record(z.any()).optional(),
  status: z.enum(['active', 'inactive']).optional()
});

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    assertUserType(user, ['company']);

    const { data, error } = await supabase
      .from('company_ca_identities')
      .select('id, user_id, company_user_id, status, permissions, created_at, users:user_id(id, name, email)')
      .eq('company_user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch company CAs:', error);
      return NextResponse.json({ error: 'Failed to fetch company CAs' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('Company CA list error:', error);
    return NextResponse.json({ error: 'Failed to fetch company CAs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    assertUserType(user, ['company']);

    const body = await request.json();
    const parsed = createCompanyCASchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid payload' }, { status: 400 });
    }

    const { name, email, password, permissions, status } = parsed.data;

    const existing = await db.users.findByEmail(email);
    if (existing) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await db.users.create({
      email,
      password: hashedPassword,
      name,
      user_type: 'company',
      verification_status: 'verified',
      email_verified: true,
      phone_verified: false,
      profile_data: {
        role: 'company_ca',
        parent_company_user_id: user.id
      }
    });

    const { data: identity, error: identityError } = await supabase
      .from('company_ca_identities')
      .insert({
        user_id: newUser.id,
        company_user_id: user.id,
        status: status ?? 'active',
        permissions: permissions ?? {
          can_review_evidence: true,
          can_confirm_payments: true,
          can_view_audit: true
        },
        created_by: user.id
      })
      .select('*')
      .single();

    if (identityError) {
      console.error('Failed to create company CA identity:', identityError);
      return NextResponse.json({ error: 'Failed to create company CA identity' }, { status: 500 });
    }

    await supabase.from('csr_audit_log').insert({
      entity_type: 'company_ca_identity',
      entity_id: identity.id,
      event_type: 'company_ca_created',
      event_hash: `company_ca_created:${identity.id}:${Date.now()}`,
      event_payload: {
        company_user_id: user.id,
        company_ca_user_id: newUser.id,
        company_ca_email: email
      },
      created_by: user.id
    });

    return NextResponse.json({
      success: true,
      data: {
        identity,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email
        }
      }
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('Company CA create error:', error);
    return NextResponse.json({ error: 'Failed to create company CA user' }, { status: 500 });
  }
}
