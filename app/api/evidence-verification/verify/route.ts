import { NextRequest, NextResponse } from 'next/server';
import { getCompanyCAFromRequest } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    const context = await getCompanyCAFromRequest(request, { allowPasswordChangePending: true });

    const evidenceVerifier = {
      identity_id: context.identity.id,
      ca_id: context.identity.ca_id,
      company_user_id: context.identity.company_user_id,
      permissions: context.identity.permissions,
      user: {
        id: context.user.id,
        email: context.user.email,
        name: context.user.name,
      },
    }

    return NextResponse.json({
      success: true,
      // JWT/session kind remains company_ca; product role is Evidence Verifier.
      role: 'company_ca',
      product_role: 'evidence_verifier',
      identity: {
        id: context.identity.id,
        must_change_password: context.identity.must_change_password || false,
      },
      evidence_verifier: evidenceVerifier,
      // Legacy key — portal pages still read company_ca during migration.
      company_ca: evidenceVerifier,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      [
        'Evidence Verifier authentication required',
        'Invalid company CA token',
        'Evidence Verifier identity not found',
        'Evidence Verifier identity is not active'
      ].includes(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error('Evidence Verifier verify error:', error);
    return NextResponse.json({ error: 'Failed to verify company CA session' }, { status: 500 });
  }
}
