import { NextRequest } from 'next/server';
import { verifyToken, type UserData } from '@/lib/auth';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  return token.length > 0 ? token : null;
}

export function getAuthUserFromRequest(request: NextRequest): UserData {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    throw new Error('Authentication required');
  }

  const user = verifyToken(token);
  if (!user) {
    throw new Error('Invalid authentication token');
  }

  return user;
}

export function assertUserType(user: UserData, allowed: Array<UserData['user_type']>) {
  if (!allowed.includes(user.user_type)) {
    throw new Error('Insufficient permissions');
  }
}
