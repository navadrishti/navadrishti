import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase, db } from '@/lib/db';
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth';
import { hashPassword } from '@/lib/auth';
import {
  generateUniqueCompanyCaId,
  getCompanyCaIdSuccessionOptions,
  isCompanyCaIdReusableForSuccession,
} from '@/lib/company-ca-id-helper';

const createCompanyCASchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  permissions: z.record(z.any()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  ca_id: z.string().optional(),
  auto_generate_ca_id: z.boolean().default(true)
});

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    assertUserType(user, ['company']);

    const url = new URL(request.url);
    const query = url.searchParams.get('query');

    // Get available CA IDs for succession assignment
    if (query === 'available-ca-ids') {
      try {
        const options = await getCompanyCaIdSuccessionOptions(user.id);
        return NextResponse.json({ success: true, data: options });
      } catch (error) {
        console.error('Failed to fetch available CA IDs:', error);
        return NextResponse.json({ error: 'Failed to fetch available CA IDs' }, { status: 500 });
      }
    }

    // Default: get all company CA identities
    const { data, error } = await supabase
      .from('company_ca_identities')
      .select('id, ca_id, user_id, company_user_id, status, permissions, created_at, users:user_id(id, name, email)')
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

    const { name, email, password, permissions, status, ca_id, auto_generate_ca_id } = parsed.data;

    // Determine the CA ID to use
    let assignedCaId: string;
    if (auto_generate_ca_id) {
      assignedCaId = await generateUniqueCompanyCaId(user.id);
    } else {
      const normalizedCaId = String(ca_id ?? '').trim();
      if (!normalizedCaId) {
        return NextResponse.json(
          { error: 'CA ID must be provided or auto-generation must be enabled' },
          { status: 400 }
        );
      }

      const reusable = await isCompanyCaIdReusableForSuccession(user.id, normalizedCaId);
      if (!reusable) {
        return NextResponse.json(
          {
            error:
              'Selected CA ID is not available for succession. Choose a CA ID from your company history with no active account, or deactivate the current holder first.',
          },
          { status: 409 }
        );
      }

      assignedCaId = normalizedCaId;
    }

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
        ca_id: assignedCaId,
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
        company_ca_email: email,
        company_ca_id: assignedCaId,
        auto_generated: auto_generate_ca_id
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
