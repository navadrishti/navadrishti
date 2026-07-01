import { NextRequest } from 'next/server';
import { verifyToken, type UserData } from '@/lib/auth';
import { verifyNavadrishtCAToken, type NavadrishtCATokenPayload } from '@/lib/navadrishti-ca-auth';
import { supabase } from '@/lib/db';
import { ensureCompanyCaIdAssigned } from '@/lib/company-ca-id-helper';

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

function extractCAToken(request: NextRequest): string | null {
  const navadrishtCAToken = request.cookies.get('navadrishti-ca-token')?.value;
  if (navadrishtCAToken) {
    return navadrishtCAToken;
  }

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

  const payload = verifyNavadrishtCAToken(token);
  if (payload) {
    return payload;
  }

  const oldPayload = verifyToken(token);
  if (oldPayload && oldPayload.id === -2) {
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

function extractCompanyCAToken(request: NextRequest): string | null {
  const cookieToken =
    request.cookies.get('evidence-verification-token')?.value ||
    request.cookies.get('company-ca-token')?.value;
  if (cookieToken) {
    return cookieToken;
  }

  return extractBearerToken(request.headers.get('authorization'));
}

export interface CompanyCAContext {
  user: UserData;
  identity: {
    id: string;
    user_id: number;
    company_user_id: number;
    ca_id?: string | null;
    status: string;
    permissions: Record<string, any>;
    must_change_password?: boolean;
  };
}

export async function getCompanyCAFromRequest(request: NextRequest): Promise<CompanyCAContext> {
  const token = extractCompanyCAToken(request);

  if (!token) {
    throw new Error('Company CA authentication required');
  }

  const user = verifyToken(token);
  if (!user) {
    throw new Error('Invalid company CA token');
  }

  const { data: identity, error } = await supabase
    .from('company_ca_identities')
    .select('id, user_id, company_user_id, ca_id, status, permissions, must_change_password')
    .eq('user_id', user.id)
    .single();

  if (error || !identity) {
    throw new Error('Company CA identity not found');
  }

  if (identity.status !== 'active') {
    throw new Error('Company CA identity is not active');
  }

  const caId = await ensureCompanyCaIdAssigned(identity.id, identity.company_user_id, identity.ca_id);

  return {
    user,
    identity: {
      id: identity.id,
      user_id: identity.user_id,
      company_user_id: identity.company_user_id,
      ca_id: caId,
      status: identity.status,
      permissions: identity.permissions ?? {},
      must_change_password: identity.must_change_password || false
    }
  };
}
