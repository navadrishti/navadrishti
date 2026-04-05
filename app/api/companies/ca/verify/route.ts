import { NextRequest, NextResponse } from 'next/server';
import { getCompanyCAFromRequest } from '@/lib/server-company-ca-auth';

export async function GET(request: NextRequest) {
  try {
    const context = await getCompanyCAFromRequest(request);

    return NextResponse.json({
      success: true,
      role: 'company_ca',
      company_ca: {
        identity_id: context.identity.id,
        company_user_id: context.identity.company_user_id,
        permissions: context.identity.permissions,
        user: {
          id: context.user.id,
          email: context.user.email,
          name: context.user.name
        }
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      [
        'Company CA authentication required',
        'Invalid company CA token',
        'Company CA identity not found',
        'Company CA identity is not active'
      ].includes(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error('Company CA verify error:', error);
    return NextResponse.json({ error: 'Failed to verify company CA session' }, { status: 500 });
  }
}
