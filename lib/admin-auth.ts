import { NextRequest } from 'next/server';
import { verifyToken, type UserData } from '@/lib/auth';

export function getAdminTokenFromRequest(request: NextRequest): string | null {
  const cookieToken = request.cookies.get('admin-token')?.value?.trim();
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    return token || null;
  }

  return null;
}

export function getAdminUser(request: NextRequest): UserData | null {
  const token = getAdminTokenFromRequest(request);
  if (!token) {
    return null;
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded || decoded.id !== -1) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function assertAdminUser(request: NextRequest): UserData {
  const admin = getAdminUser(request);
  if (!admin) {
    throw new Error('Admin authentication required');
  }

  return admin;
}