import { supabase } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export type CompanyCaIdSuccessionOption = {
  ca_id: string;
  holder_name: string | null;
  holder_status: string | null;
  reusable: boolean;
};

export async function verifyCompanyCA(token: string) {
  try {
    const { data } = await supabase
      .from('company_ca_identities')
      .select('*, users(*)')
      .eq('auth_token', token)
      .maybeSingle();
    if (!data) return { success: false };
    if (!data.active) return { success: false };
    return { success: true, company_ca: data };
  } catch (e) {
    console.error('Company CA verify error:', e);
    return { success: false };
  }
}

export async function getCompanyCAUserIdSet(candidateUserIds?: number[]): Promise<Set<number>> {
  let query = supabase.from('company_ca_identities').select('user_id');

  if (candidateUserIds && candidateUserIds.length > 0) {
    query = query.in('user_id', candidateUserIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  return new Set((data ?? []).map((row) => Number(row.user_id)));
}

export async function isCompanyCAUser(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('company_ca_identities')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function generateUniqueCompanyCaId(companyUserId: number): Promise<string> {
  const { data: existingIds, error } = await supabase
    .from('company_ca_identities')
    .select('ca_id')
    .eq('company_user_id', companyUserId)
    .not('ca_id', 'is', null);

  if (error) {
    throw new Error(`Failed to fetch existing CA IDs: ${error.message}`);
  }

  const prefix = `CAID-${companyUserId}-`;
  const used = new Set<string>();
  let maxSequence = 0;

  for (const row of existingIds ?? []) {
    const caId = String(row.ca_id ?? '').trim();
    if (!caId) continue;

    used.add(caId);

    if (!caId.startsWith(prefix)) continue;

    const sequence = Number.parseInt(caId.slice(prefix.length), 10);
    if (Number.isFinite(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  let nextSequence = maxSequence + 1;
  let candidate = `${prefix}${String(nextSequence).padStart(3, '0')}`;

  while (used.has(candidate)) {
    nextSequence += 1;
    candidate = `${prefix}${String(nextSequence).padStart(3, '0')}`;
  }

  return candidate;
}

export async function ensureCompanyCaIdAssigned(
  identityId: string,
  companyUserId: number,
  currentCaId?: string | null
): Promise<string> {
  const existing = String(currentCaId ?? '').trim();
  if (existing) return existing;

  const newCaId = await generateUniqueCompanyCaId(companyUserId);
  const { error } = await supabase
    .from('company_ca_identities')
    .update({ ca_id: newCaId, updated_at: new Date().toISOString() })
    .eq('id', identityId)
    .is('ca_id', null);

  if (error) {
    throw new Error(`Failed to assign CA ID: ${error.message}`);
  }

  const { data, error: readError } = await supabase
    .from('company_ca_identities')
    .select('ca_id')
    .eq('id', identityId)
    .single();

  if (readError) {
    throw new Error(`Failed to read assigned CA ID: ${readError.message}`);
  }

  return String(data?.ca_id ?? newCaId).trim();
}

export async function getCompanyCaIdSuccessionOptions(
  companyUserId: number
): Promise<CompanyCaIdSuccessionOption[]> {
  const { data, error } = await supabase
    .from('company_ca_identities')
    .select('ca_id, status, users:user_id(name)')
    .eq('company_user_id', companyUserId)
    .not('ca_id', 'is', null)
    .order('ca_id', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch available CA IDs: ${error.message}`);
  }

  const byCaId = new Map<string, CompanyCaIdSuccessionOption>();

  for (const row of data ?? []) {
    const ca_id = String(row.ca_id ?? '').trim();
    if (!ca_id) continue;

    const holderName = (row as { users?: { name?: string | null } | null }).users?.name ?? null;
    const status = row.status ?? null;
    const existing = byCaId.get(ca_id);

    if (!existing) {
      byCaId.set(ca_id, {
        ca_id,
        holder_name: holderName,
        holder_status: status,
        reusable: status !== 'active',
      });
      continue;
    }

    if (status === 'active') {
      existing.holder_name = holderName;
      existing.holder_status = status;
      existing.reusable = false;
    }
  }

  return Array.from(byCaId.values());
}

export async function isCompanyCaIdRegisteredForCompany(
  companyUserId: number,
  caId: string
): Promise<boolean> {
  const normalizedCaId = caId.trim();
  if (!normalizedCaId) return false;

  const { data, error } = await supabase
    .from('company_ca_identities')
    .select('id')
    .eq('company_user_id', companyUserId)
    .eq('ca_id', normalizedCaId)
    .limit(1);

  if (error) {
    throw new Error(`Failed to check CA ID registration: ${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}

export async function isCompanyCaIdReusableForSuccession(
  companyUserId: number,
  caId: string
): Promise<boolean> {
  if (!(await isCompanyCaIdRegisteredForCompany(companyUserId, caId))) {
    return false;
  }

  const { data, error } = await supabase
    .from('company_ca_identities')
    .select('id')
    .eq('company_user_id', companyUserId)
    .eq('ca_id', caId.trim())
    .eq('status', 'active')
    .limit(1);

  if (error) {
    throw new Error(`Failed to check CA ID reuse eligibility: ${error.message}`);
  }

  return (data?.length ?? 0) === 0;
}

export async function resetCompanyCaPassword(input: {
  identityId: string;
  companyUserId: number;
  password: string;
}) {
  const { identityId, companyUserId, password } = input;
  const passwordHash = await hashPassword(password);

  const { data: existing, error: findError } = await supabase
    .from('company_ca_identities')
    .select('*')
    .eq('id', identityId)
    .eq('company_user_id', companyUserId)
    .single();

  if (findError || !existing) {
    throw new Error('CA identity not found');
  }

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({ password: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', existing.user_id);

  if (userUpdateError) {
    throw new Error('Failed to reset CA password');
  }

  const { data: updated, error: identityUpdateError } = await supabase
    .from('company_ca_identities')
    .update({
      must_change_password: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', identityId)
    .eq('company_user_id', companyUserId)
    .select('*')
    .single();

  if (identityUpdateError) {
    throw new Error('Failed to reset CA password');
  }

  await supabase.from('csr_audit_log').insert({
    entity_type: 'company_ca_identity',
    entity_id: identityId,
    event_type: 'company_ca_password_reset',
    event_hash: `company_ca_password_reset:${identityId}:${Date.now()}`,
    event_payload: {
      company_user_id: companyUserId,
      company_ca_user_id: existing.user_id,
      reset_by_company: true,
    },
    created_by: companyUserId,
  });

  return updated;
}
