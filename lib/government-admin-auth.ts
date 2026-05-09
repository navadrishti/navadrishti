import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { comparePassword, hashPassword, JWT_SECRET } from '@/lib/auth';
import { supabase } from '@/lib/db';

export type GovernmentAdminRole = 'super_admin' | 'government_admin' | 'state_officer' | 'district_officer' | 'field_officer';

export type GovernmentAdminAccount = {
  id: number;
  government_body_id: number;
  username: string;
  email: string;
  display_name: string;
  role: GovernmentAdminRole;
  active: boolean;
  must_change_password: boolean;
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type GovernmentBody = {
  id: number;
  department_name: string;
  state_name: string;
  is_active: boolean;
  created_by_admin_id?: number | null;
  created_at?: string;
  updated_at?: string;
};

type GovernmentAdminTokenPayload = {
  id: number;
  username: string;
  email: string;
  display_name: string;
  role: GovernmentAdminRole;
};

export function generateGovernmentAdminToken(account: GovernmentAdminAccount): string {
  const payload: GovernmentAdminTokenPayload = {
    id: account.id,
    username: account.username,
    email: account.email,
    display_name: account.display_name,
    role: account.role,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.GOVT_ADMIN_JWT_EXPIRES_IN || '12h' });
}

export function verifyGovernmentAdminToken(token: string): GovernmentAdminTokenPayload | null {
  try {
    if (!token || !token.trim()) return null;
    const cleanToken = token.replace(/["'\n\r\t]/g, '').replace(/^Bearer\s+/i, '').trim();
    if (!cleanToken) return null;
    return jwt.verify(cleanToken, JWT_SECRET) as GovernmentAdminTokenPayload;
  } catch {
    return null;
  }
}

export function getGovernmentAdminTokenFromRequest(request: NextRequest): string | null {
  const cookieToken = request.cookies.get('govt-admin-token')?.value?.trim();
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7).trim() || null;
  }

  return null;
}

export async function getGovernmentAdminFromRequest(request: NextRequest): Promise<(GovernmentAdminAccount & { password_hash?: string }) | null> {
  const token = getGovernmentAdminTokenFromRequest(request);
  if (!token) return null;

  const decoded = verifyGovernmentAdminToken(token);
  if (!decoded?.id) return null;

  const { data, error } = await supabase
    .from('government_admin_accounts')
    .select('*')
    .eq('id', decoded.id)
    .single();

  if (error || !data || data.active === false) return null;
  return data as GovernmentAdminAccount & { password_hash?: string };
}

export async function getGovernmentBodyById(bodyId: number) {
  const { data, error } = await supabase
    .from('government_bodies')
    .select('*')
    .eq('id', bodyId)
    .single();

  if (error || !data) return null;
  return data as GovernmentBody;
}

export async function listGovernmentBodies() {
  const { data, error } = await supabase
    .from('government_bodies')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as GovernmentBody[];
}

export async function findGovernmentAdminAccountByRole(role: GovernmentAdminRole) {
  const { data, error } = await supabase
    .from('government_admin_accounts')
    .select('*')
    .eq('role', role)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as (GovernmentAdminAccount & { password_hash?: string }) | null;
}

export async function updateGovernmentBody(bodyId: number, input: {
  department_name: string;
  state_name: string;
  is_active?: boolean;
}) {
  const { data, error } = await supabase
    .from('government_bodies')
    .update({
      department_name: input.department_name,
      state_name: input.state_name,
      is_active: input.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bodyId)
    .select('*')
    .single();

  if (error) throw error;
  return data as GovernmentBody;
}

export async function updateGovernmentAdminAccount(accountId: number, input: {
  government_body_id: number;
  username: string;
  email: string;
  display_name: string;
  role: GovernmentAdminRole;
  temporaryPassword: string;
  state_name?: string | null;
  district_name?: string | null;
  createdByAdminId?: number | null;
  active?: boolean;
  must_change_password?: boolean;
}) {
  const password_hash = await hashPassword(input.temporaryPassword);

  const { data, error } = await supabase
    .from('government_admin_accounts')
    .update({
      government_body_id: input.government_body_id,
      username: input.username,
      email: input.email,
      display_name: input.display_name,
      role: input.role,
      password_hash,
      state_name: input.state_name ?? null,
      district_name: input.district_name ?? null,
      active: input.active ?? true,
      must_change_password: input.must_change_password ?? true,
      created_by_admin_id: input.createdByAdminId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .select('*')
    .single();

  if (error) throw error;
  return data as GovernmentAdminAccount;
}

export async function createGovernmentBody(input: {
  department_name: string;
  state_name: string;
  createdByAdminId?: number | null;
}) {
  const { data, error } = await supabase
    .from('government_bodies')
    .insert({
      department_name: input.department_name,
      state_name: input.state_name,
      created_by_admin_id: input.createdByAdminId ?? null,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as GovernmentBody;
}

export async function assertGovernmentAdmin(request: NextRequest) {
  const admin = await getGovernmentAdminFromRequest(request);
  if (!admin) {
    throw new Error('Government admin authentication required');
  }
  return admin;
}

export async function createGovernmentAdminAccount(input: {
  government_body_id: number;
  username: string;
  email: string;
  display_name: string;
  role: GovernmentAdminRole;
  temporaryPassword: string;
  state_name?: string | null;
  district_name?: string | null;
  createdByAdminId?: number | null;
}) {
  const password_hash = await hashPassword(input.temporaryPassword);

  const { data, error } = await supabase
    .from('government_admin_accounts')
    .insert({
      government_body_id: input.government_body_id,
      username: input.username,
      email: input.email,
      display_name: input.display_name,
      role: input.role,
      password_hash,
      state_name: input.state_name ?? null,
      district_name: input.district_name ?? null,
      must_change_password: true,
      active: true,
      created_by_admin_id: input.createdByAdminId ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as GovernmentAdminAccount;
}

export async function updateGovernmentAdminPassword(accountId: number, password: string) {
  const password_hash = await hashPassword(password);
  const { data, error } = await supabase
    .from('government_admin_accounts')
    .update({
      password_hash,
      must_change_password: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .select('*')
    .single();

  if (error) throw error;
  return data as GovernmentAdminAccount;
}

export async function verifyGovernmentAdminPassword(accountId: number, password: string) {
  const { data, error } = await supabase
    .from('government_admin_accounts')
    .select('password_hash')
    .eq('id', accountId)
    .single();

  if (error || !data?.password_hash) return false;
  return comparePassword(password, data.password_hash);
}
