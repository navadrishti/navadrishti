import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isPlatformUserSession } from '@/lib/auth';
import { clearAuthTokenCookie, findAuthUser, findSessionGate } from '@/lib/server-auth';

const SESSION_CHECK_EXEMPT_PATHS = new Set(['/api/auth/logout']);
const COMPANY_CA_ALLOWED_API_PREFIXES = [
  '/api/evidence-verification',
  '/api/csr-projects',
  '/api/milestones',
  '/api/payments/pending',
];

function isDelegatedCompanyCaApiAllowed(pathname: string) {
  return COMPANY_CA_ALLOWED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/') && !SESSION_CHECK_EXEMPT_PATHS.has(pathname)) {
    const user = findAuthUser(request, { allowCookie: true });
    if (isPlatformUserSession(user)) {
      const gate = await findSessionGate(Number(user.id)).catch((error: unknown) => {
        // A lookup failure must not take the whole API down; routes still verify the token.
        console.error('[proxy] session status lookup failed:', error);
        return null;
      });
      if (gate?.reason) {
        const response = NextResponse.json({ error: gate.reason }, { status: 403 });
        clearAuthTokenCookie(response);
        return response;
      }
      if (gate?.delegatedCompanyCa && !isDelegatedCompanyCaApiAllowed(pathname)) {
        return NextResponse.json(
          { error: 'This account can only access the evidence verification portal' },
          { status: 403 }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Banned or suspended users lose API access immediately, not when their token expires
    '/api/:path*',
  ],
};
