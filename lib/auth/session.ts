import jwt, { JsonWebTokenError, type JwtPayload, type SignOptions } from 'jsonwebtoken';
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

export type ScopedTokenKind = 'platform_ca' | 'company_ca';

export class AuthError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403 = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

const ADMIN_SESSION_ID = -1;
const USER_TYPES = new Set(['individual', 'ngo', 'company']);
const SURROUNDING_QUOTES = /^(["'])([\s\S]*)\1$/;

function assertJwtSecret() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
}

function unquote(value: string): string {
  const match = SURROUNDING_QUOTES.exec(value);
  return match ? match[2].trim() : value;
}

function normalizeTokenInput(token: string): string {
  return unquote(unquote(token.trim()).replace(/^Bearer\s+/i, '').trim());
}

function decodeSignedToken(token: string): JwtPayload | null {
  if (!JWT_SECRET || !token) {
    return null;
  }

  const cleanToken = normalizeTokenInput(token);
  if (cleanToken.split('.').length !== 3) {
    return null;
  }

  try {
    const decoded = jwt.verify(cleanToken, JWT_SECRET, { algorithms: ['HS256'] });
    return typeof decoded === 'string' ? null : decoded;
  } catch (error) {
    if (!(error instanceof JsonWebTokenError)) {
      console.error('Token verification failed:', error);
    }
    return null;
  }
}

function isUserSessionPayload(decoded: JwtPayload): boolean {
  if (decoded.kind !== undefined) return false;
  // Platform CA tokens issued before the `kind` claim existed.
  if (decoded.ca_id !== undefined || decoded.role !== undefined) return false;
  return decoded.user_type === undefined || USER_TYPES.has(decoded.user_type);
}

export function signScopedToken(
  kind: ScopedTokenKind,
  payload: object,
  expiresIn: SignOptions['expiresIn']
): string {
  assertJwtSecret();
  return jwt.sign({ ...payload, kind }, JWT_SECRET, { expiresIn });
}

export function verifyScopedToken<T extends object>(token: string, kind: ScopedTokenKind): (T & JwtPayload) | null {
  const decoded = decodeSignedToken(token);
  if (!decoded || decoded.kind !== kind) {
    return null;
  }
  return decoded as T & JwtPayload;
}

export function generateAdminToken(): string {
  assertJwtSecret();
  return jwt.sign(
    {
      id: ADMIN_SESSION_ID,
      email: 'admin@system.local',
      name: 'Administrator',
      user_type: 'admin'
    },
    JWT_SECRET,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'] }
  );
}

/** Console admin session; typed as UserData for existing admin route handlers. */
export function verifyAdminToken(token: string): UserData | null {
  const decoded = decodeSignedToken(token);
  if (!decoded || decoded.id !== ADMIN_SESSION_ID || decoded.user_type !== 'admin') {
    return null;
  }

  return {
    id: decoded.id,
    email: decoded.email || '',
    name: decoded.name || '',
    user_type: decoded.user_type
  } as UserData;
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
  const decoded = decodeSignedToken(token);
  if (!decoded || !decoded.id || !decoded.email || !isUserSessionPayload(decoded)) {
    return null;
  }

  return {
    id: decoded.id,
    email: decoded.email,
    name: decoded.name || '',
    user_type: decoded.user_type || 'individual'
  } as UserData;
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
  if (!header?.startsWith('Bearer ')) return null;
  const decoded = decodeSignedToken(header.slice(7));
  if (!decoded || !isUserSessionPayload(decoded)) return null;
  return decoded as TokenClaims;
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
