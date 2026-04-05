import { NextRequest } from 'next/server';
import { verifyToken, type UserData } from '@/lib/auth';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  return token.length > 0 ? token : null;
}

function extractCAToken(request: NextRequest): string | null {
  const fromCookie = request.cookies.get('ca-token')?.value;
  if (fromCookie) {
    return fromCookie;
  }

  return extractBearerToken(request.headers.get('authorization'));
}

export function getCAFromRequest(request: NextRequest): UserData {
  const token = extractCAToken(request);

  if (!token) {
    throw new Error('CA authentication required');
  }

  const actor = verifyToken(token);
  if (!actor || actor.id !== -2) {
    throw new Error('Invalid CA token');
  }

  return actor;
}

export function isCARequest(request: NextRequest): boolean {
  try {
    getCAFromRequest(request);
    return true;
  } catch {
    return false;
  }
}
