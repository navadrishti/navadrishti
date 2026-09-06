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
    // Paused / not-shipping surfaces
    '/government-admin',
    '/government-admin/:path*',
  ],
};
