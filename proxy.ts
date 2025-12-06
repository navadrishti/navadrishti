import { NextResponse, type NextRequest } from 'next/server';
import { verifyAuthTokenEdge, hasBasicPermissionEdge } from '@/lib/edge-access-control';

// Rate limiting storage (in production, use Redis or database)
const rateLimit = new Map<string, { count: number; resetTime: number }>();

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Security headers
  const response = NextResponse.next();
  
  // Add security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // HSTS header for HTTPS
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Rate limiting for sensitive endpoints
  const sensitiveEndpoints = [
    '/api/auth/login',
    '/api/auth/register', 
    '/api/auth/send-otp',
    '/api/auth/verify-phone',
    '/api/auth/send-verification-email'
  ];

  if (sensitiveEndpoints.some(endpoint => pathname.startsWith(endpoint))) {
    const ip = request.headers.get('X-Forwarded-For') || request.headers.get('X-Real-IP') || 'unknown';
    const key = `rate-limit:${ip}`;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 10;

    const record = rateLimit.get(key);
    
    if (record && record.resetTime > now) {
      if (record.count >= maxRequests) {
        return NextResponse.json(
          { error: 'Too many requests, please try again later' },
          { status: 429 }
        );
      }
      record.count++;
    } else {
      rateLimit.set(key, { count: 1, resetTime: now + windowMs });
    }

    // Clean up expired records periodically
    if (Math.random() < 0.01) { // 1% chance
      for (const [key, record] of rateLimit.entries()) {
        if (record.resetTime <= now) {
          rateLimit.delete(key);
        }
      }
    }
  }

  // Block debug endpoints in production unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && 
      process.env.ENABLE_DEBUG_ENDPOINTS !== 'true' &&
      pathname.startsWith('/api/debug/')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // API route permission checking
  if (pathname.startsWith('/api/')) {
    // Only check permissions for endpoints that need organization verification
    // Posts creation will be handled by the API route itself
    
    // Temporarily bypass middleware auth for service requests and offers - let API handle it
    // if (pathname.startsWith('/api/service-offers') && request.method === 'POST') {
    //   const user = await verifyAuthTokenEdge(request);
    //   if (!hasBasicPermissionEdge(user, 'create_service_offer')) {
    //     return NextResponse.json(
    //       { 
    //         error: 'Only verified NGOs can create service offers',
    //         code: 'INSUFFICIENT_PERMISSIONS'
    //       },
    //       { status: 403 }
    //     );
    //   }
    // } else 
    if (pathname.startsWith('/api/marketplace') && request.method === 'POST') {
      const user = await verifyAuthTokenEdge(request);
      if (!hasBasicPermissionEdge(user, 'create_marketplace')) {
        return NextResponse.json(
          { 
            error: 'Only verified NGOs and companies can create marketplace listings',
            code: 'INSUFFICIENT_PERMISSIONS'
          },
          { status: 403 }
        );
      }
    }
  }

  // Client-side route protection (for SSR/initial page loads)
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/_next/')) {
    // Simple route protection for common protected routes
    const protectedRoutes = [
      '/individuals/dashboard',
      '/ngos/dashboard', 
      '/companies/dashboard',
      '/service-requests/create',
      '/service-offers/create',
      '/marketplace/create',
      '/verification'
    ];
    
    if (protectedRoutes.some(route => pathname.startsWith(route))) {
      // Extract token from cookie for initial page loads
      const token = request.cookies.get('token')?.value;
      
      if (!token) {
        // Redirect to login for protected routes
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      }

      // Note: For client-side routing, the enhanced ProtectedRoute component
      // will handle the detailed permission checking
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
}
