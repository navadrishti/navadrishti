import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isPlatformUserSession } from '@/lib/auth';
import { clearAuthTokenCookie, findAuthUser, findSessionBlockReason } from '@/lib/server-auth';

const SESSION_CHECK_EXEMPT_PATHS = new Set(['/api/auth/logout']);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/') && !SESSION_CHECK_EXEMPT_PATHS.has(pathname)) {
    const user = findAuthUser(request, { allowCookie: true });
    if (isPlatformUserSession(user)) {
      const blockReason = await findSessionBlockReason(Number(user.id)).catch((error: unknown) => {
        // A lookup failure must not take the whole API down; routes still verify the token.
        console.error('[proxy] session status lookup failed:', error);
        return null;
      });
      if (blockReason) {
        const response = NextResponse.json({ error: blockReason }, { status: 403 });
        clearAuthTokenCookie(response);
        return response;
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
