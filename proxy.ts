import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  getLaunchPhaseRedirectPath,
  isPhase1BlockedPath,
  isPermanentlyBlockedPath,
} from '@/lib/access-control';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPermanentlyBlockedPath(pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (isPhase1BlockedPath(pathname)) {
    return NextResponse.redirect(new URL(getLaunchPhaseRedirectPath(), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/service-requests/:path*',
    '/service-offers/:path*',
    '/csr-campaigns/:path*',
    '/companies/csr-agent/:path*',
    '/companies/csr-budget/:path*',
    '/companies/csr-health/:path*',
    '/companies/impact-reports/:path*',
    '/ngos/ai-agent/:path*',
    '/ngos/ngo-agent/:path*',
    '/ngos/ngo-matching/:path*',
    '/government-admin/:path*',
  ],
};
