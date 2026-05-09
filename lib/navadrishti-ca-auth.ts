import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { comparePassword, hashPassword, JWT_SECRET } from '@/lib/auth';
import { supabase } from '@/lib/db';

export type NavadrishtCAAccount = {
  id: number;
  ca_id: string;
  username: string;
  display_name: string;
  active: boolean;
  must_change_password: boolean;
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type NavadrishtCATokenPayload = {
  id: number;
  ca_id: string;
  username: string;
  display_name: string;
};

export function generateNavadrishtCAToken(account: NavadrishtCAAccount): string {
  const payload: NavadrishtCATokenPayload = {
    id: account.id,
    ca_id: account.ca_id,
    username: account.username,
    display_name: account.display_name,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.CA_JWT_EXPIRES_IN || '12h' });
}

export function verifyNavadrishtCAToken(token: string): NavadrishtCATokenPayload | null {
  try {
    if (!token || !token.trim()) return null;
    const cleanToken = token.replace(/["'\n\r\t]/g, '').replace(/^Bearer\s+/i, '').trim();
    if (!cleanToken) return null;
    return jwt.verify(cleanToken, JWT_SECRET) as NavadrishtCATokenPayload;
  } catch {
    return null;
  }
}

export function getNavadrishtCATokenFromRequest(request: NextRequest): string | null {
  const cookieToken = request.cookies.get('navadrishti-ca-token')?.value?.trim();
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7).trim() || null;
  }

  return null;
}

export async function getNavadrishtCAFromRequest(request: NextRequest): Promise<(NavadrishtCAAccount & { password_hash?: string }) | null> {
  const token = getNavadrishtCATokenFromRequest(request);
  if (!token) return null;

  const decoded = verifyNavadrishtCAToken(token);
  if (!decoded?.id) return null;

  const { data, error } = await supabase
    .from('navadrishti_ca_accounts')
    .select('*')
    .eq('id', decoded.id)
    .single();

  if (error || !data || data.active === false) return null;
  return data as NavadrishtCAAccount & { password_hash?: string };
}

export async function listNavadrishtCAAccounts() {
  const { data, error } = await supabase
    .from('navadrishti_ca_accounts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as NavadrishtCAAccount[];
}

export async function createNavadrishtCAAccount(input: {
  ca_id: string;
  username: string;
  display_name: string;
  temporaryPassword: string;
  createdByAdminId?: number | null;
}) {
  const password_hash = await hashPassword(input.temporaryPassword);

  const { data, error } = await supabase
    .from('navadrishti_ca_accounts')
    .insert({
      ca_id: input.ca_id,
      username: input.username,
      display_name: input.display_name,
      password_hash,
      must_change_password: true,
      active: true,
      created_by_admin_id: input.createdByAdminId ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as NavadrishtCAAccount;
}

export async function updateNavadrishtCAPassword(accountId: number, password: string) {
  const password_hash = await hashPassword(password);
  const { data, error } = await supabase
    .from('navadrishti_ca_accounts')
    .update({
      password_hash,
      must_change_password: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .select('*')
    .single();

  if (error) throw error;
  return data as NavadrishtCAAccount;
}

export async function verifyNavadrishtCAPassword(accountId: number, password: string) {
  const { data, error } = await supabase
    .from('navadrishti_ca_accounts')
    .select('password_hash')
    .eq('id', accountId)
    .single();

  if (error || !data?.password_hash) return false;
  return comparePassword(password, data.password_hash);
}

export async function assertNavadrishtCA(request: NextRequest) {
  const ca = await getNavadrishtCAFromRequest(request);
  if (!ca) {
    throw new Error('Navadrishti CA authentication required');
  }
  return ca;
}
