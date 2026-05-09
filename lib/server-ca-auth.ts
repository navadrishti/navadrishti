import { NextRequest } from 'next/server';
import { verifyToken, type UserData } from '@/lib/auth';
import { verifyNavadrishtCAToken, type NavadrishtCATokenPayload } from '@/lib/navadrishti-ca-auth';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  return token.length > 0 ? token : null;
}

function extractCAToken(request: NextRequest): string | null {
  // Try Navadrishti CA token first
  const navadrishtCAToken = request.cookies.get('navadrishti-ca-token')?.value;
  if (navadrishtCAToken) {
    return navadrishtCAToken;
  }

  // Fallback to old ca-token for backwards compatibility
  const oldCAToken = request.cookies.get('ca-token')?.value;
  if (oldCAToken) {
    return oldCAToken;
  }

  return extractBearerToken(request.headers.get('authorization'));
}

export function getCAFromRequest(request: NextRequest): NavadrishtCATokenPayload | null {
  const token = extractCAToken(request);

  if (!token) {
    return null;
  }

  // Try Navadrishti CA token
  const payload = verifyNavadrishtCAToken(token);
  if (payload) {
    return payload;
  }

  // Fallback to old token verification for backwards compatibility
  const oldPayload = verifyToken(token);
  if (oldPayload && oldPayload.id === -2) {
    // Convert to new format for consistency
    return {
      id: oldPayload.id,
      ca_id: 'legacy',
      username: 'ca',
      email: oldPayload.email,
      display_name: oldPayload.name || 'CA Console User',
    };
  }

  return null;
}

export function isCARequest(request: NextRequest): boolean {
  return getCAFromRequest(request) !== null;
}

