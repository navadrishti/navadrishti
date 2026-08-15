import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  getLaunchBlockedRedirectPath,
  isLaunchBlockedPath,
} from '@/lib/access-control';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isLaunchBlockedPath(pathname)) {
    return NextResponse.redirect(
      new URL(getLaunchBlockedRedirectPath(pathname), request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Phase 1 feature surfaces
    '/service-requests',
    '/service-requests/:path*',
    '/service-offers',
    '/service-offers/:path*',
    '/csr-campaigns',
    '/csr-campaigns/:path*',
    '/companies/csr-agent',
    '/companies/csr-agent/:path*',
    '/companies/csr-budget',
    '/companies/csr-budget/:path*',
    '/companies/csr-health',
    '/companies/csr-health/:path*',
    '/companies/impact-reports',
    '/companies/impact-reports/:path*',
    '/ngos/ai-agent',
    '/ngos/ai-agent/:path*',
    '/ngos/ngo-agent',
    '/ngos/ngo-agent/:path*',
    '/ngos/ngo-matching',
    '/ngos/ngo-matching/:path*',
    // Phase 1 only — Evidence Verification (allowed again from Phase 2)
    '/evidence-verification',
    '/evidence-verification/:path*',
    // Far future / paused — Government admin + analytics, social posts
    '/government-admin',
    '/government-admin/:path*',
    '/posts',
    '/posts/:path*',
    '/home',
    '/home/:path*',
  ],
};
