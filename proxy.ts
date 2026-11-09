import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isPlatformUserSession } from '@/lib/auth';
import {
  COMPANY_EMPLOYEE_HOME,
  companyEmployeeRedirectPath,
  isCompanyEmployeeApiAllowed,
  isCompanyEmployeePageAllowed,
} from '@/lib/company-employee-access';
import { clearAuthTokenCookie, findAuthUser, findSessionGate } from '@/lib/server-auth';

const SESSION_CHECK_EXEMPT_PATHS = new Set([
  '/api/auth/logout',
  // Provider callbacks must never depend on a browser session cookie.
  '/api/webhooks/razorpay',
]);
/** Evidence Verifier (legacy internal name: company CA) API allowlist on the main platform. */
const EVIDENCE_VERIFIER_ALLOWED_API_PREFIXES = [
  '/api/evidence-verification',
  '/api/csr-projects',
  '/api/milestones',
  '/api/payments/pending',
];

/** Field Officers have no main-platform API surface until PWA integration lands. */
const FIELD_OFFICER_ALLOWED_API_PREFIXES = ['/api/auth/logout'];

function isDelegatedEvidenceVerifierApiAllowed(pathname: string) {
  return EVIDENCE_VERIFIER_ALLOWED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isDelegatedFieldOfficerApiAllowed(pathname: string) {
  return FIELD_OFFICER_ALLOWED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function redirectEmployee(request: NextRequest, target: string) {
  const url = request.nextUrl.clone();
  url.pathname = target;
  url.search = '';
  return NextResponse.redirect(url);
}

function homeForUserType(userType: string | null | undefined): string {
  switch (userType) {
    case 'company':
      return '/companies/dashboard';
    case 'ngo':
      return '/ngos/dashboard';
    case 'individual':
      return '/individuals/dashboard';
    default:
      return '/';
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (isApi && SESSION_CHECK_EXEMPT_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const user = findAuthUser(request, { allowCookie: true });
  if (!isPlatformUserSession(user)) {
    return NextResponse.next();
  }

  let gate: Awaited<ReturnType<typeof findSessionGate>>;
  try {
    gate = await findSessionGate(Number(user.id));
  } catch {
    console.error('[proxy] session status lookup failed');
    return NextResponse.json({ error: 'Authorization service temporarily unavailable' }, { status: 503 });
  }

  if (isApi) {
    if (gate?.reason) {
      const response = NextResponse.json({ error: gate.reason }, { status: 403 });
      clearAuthTokenCookie(response);
      return response;
    }
    if (gate?.delegatedCompanyCa && !isDelegatedEvidenceVerifierApiAllowed(pathname)) {
      return NextResponse.json(
        { error: 'This account can only access the evidence verification portal' },
        { status: 403 }
      );
    }
    if (gate?.delegatedFieldOfficer && !isDelegatedFieldOfficerApiAllowed(pathname)) {
      return NextResponse.json(
        { error: 'This account cannot access the main platform' },
        { status: 403 }
      );
    }
    if (gate?.delegatedCompanyEmployee) {
      if (
        !isCompanyEmployeeApiAllowed(pathname, {
          mustChangePassword: gate.companyEmployeeMustChangePassword,
        })
      ) {
        return NextResponse.json(
          {
            error: gate.companyEmployeeMustChangePassword
              ? 'Password change required before continuing.'
              : 'This account can only access assigned project monitoring',
          },
          { status: 403 }
        );
      }
    }
    return NextResponse.next();
  }

  // Page routes — Company Employees stay inside /employees/* with no unauthorized flash.
  if (gate?.reason) {
    const response = redirectEmployee(request, '/login');
    clearAuthTokenCookie(response);
    return response;
  }

  if (gate?.delegatedCompanyEmployee) {
    const mustChange = Boolean(gate.companyEmployeeMustChangePassword);
    if (!isCompanyEmployeePageAllowed(pathname, { mustChangePassword: mustChange })) {
      return redirectEmployee(request, companyEmployeeRedirectPath({ mustChangePassword: mustChange }));
    }
    return NextResponse.next();
  }

  // Non-employees cannot open the employee workspace.
  if (pathname === '/employees' || pathname.startsWith('/employees/')) {
    return redirectEmployee(request, homeForUserType(gate?.userType || user.user_type));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * API session gates + employee page isolation.
     * Skip Next internals and common static assets.
     */
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|photos/|icons/|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};

// Re-export for tests that assert the employee home constant remains stable.
export { COMPANY_EMPLOYEE_HOME };
