import jwt, { JsonWebTokenError, TokenExpiredError, type SignOptions } from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';

export const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();

export const PHONE_VERIFICATION_ENABLED = false;

export interface UserData {
  id: number;
  email: string;
  name: string;
  user_type: 'individual' | 'ngo' | 'company';
  verification_status?: 'verified' | 'unverified' | 'pending' | 'suspended';
  email_verified?: boolean;
  phone_verified?: boolean;
}

function assertJwtSecret() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
}

export function generateToken(user: UserData): string {
  assertJwtSecret();
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      user_type: user.user_type,
      verification_status: user.verification_status || 'unverified',
      email_verified: user.email_verified || false,
      phone_verified: user.phone_verified || false
    },
    JWT_SECRET,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'] }
  );
}

export function verifyToken(token: string): UserData | null {
  try {
    if (!JWT_SECRET || !token || token.trim() === '') {
      return null;
    }

    let cleanToken = token.replace(/[\"'\n\r\t]/g, '').trim();

    if (cleanToken.startsWith('Bearer ')) {
      cleanToken = cleanToken.substring(7).trim();
    }

    if (cleanToken.length === 0) {
      return null;
    }

    const tokenParts = cleanToken.split('.');
    if (tokenParts.length !== 3) {
      return null;
    }

    const decoded = jwt.verify(cleanToken, JWT_SECRET);

    if (typeof decoded === 'string' || !decoded.id || !decoded.email) {
      return null;
    }

    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name || '',
      user_type: decoded.user_type || 'individual'
    } as UserData;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return null;
    }

    if (error instanceof JsonWebTokenError) {
      return null;
    }

    console.error('Token verification failed:', error);
    return null;
  }
}

export type TokenClaims = {
  id: number;
  user_type: string;
  email?: string;
  name?: string;
  verification_status?: string;
};

/** Claims from the request's Bearer token, or null when it is missing, malformed or expired. */
export function getTokenClaims(request: NextRequest): TokenClaims | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ') || !JWT_SECRET) return null;
  try {
    return jwt.verify(header.slice(7).trim(), JWT_SECRET) as TokenClaims;
  } catch {
    return null;
  }
}

/** Platform end-user sessions only — never treat console admin JWTs as users. */
export function isPlatformUserSession(user: UserData | null | undefined): user is UserData {
  if (!user) return false;
  if (!Number.isFinite(Number(user.id)) || Number(user.id) <= 0) return false;
  if (String(user.user_type || '').toLowerCase() === 'admin') return false;
  if (String(user.email || '').toLowerCase() === 'admin@system.local') return false;
  return true;
}

export type AuthenticatedRequest = NextRequest & { user: UserData };

export function withAuth<Args extends unknown[]>(
  handler: (req: AuthenticatedRequest, ...args: Args) => Promise<Response> | Response
) {
  return async (req: NextRequest, ...args: Args) => {
    try {
      const authHeader = req.headers.get('authorization');
      let token;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else {
        const cookieToken = req.cookies.get('token')?.value;
        if (!cookieToken) {
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        token = cookieToken;
      }

      const user = verifyToken(token);
      if (!isPlatformUserSession(user)) {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
      }

      const authedRequest = req as AuthenticatedRequest;
      authedRequest.user = user;
      return handler(authedRequest, ...args);
    } catch (error) {
      console.error('Authentication error:', error);
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }
  };
}
