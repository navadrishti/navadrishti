import { supabase } from '@/lib/db';

export type CompanyCaIdSuccessionOption = {
  ca_id: string;
  holder_name: string | null;
  holder_status: string | null;
  reusable: boolean;
};

/**
 * Generate a unique CA ID for a specific company.
 * Format: CAID-{COMPANY_ID}-{SEQUENCE} (e.g. CAID-5-001).
 * Sequence is derived from the highest suffix across all existing IDs for the company.
 */
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

/**
 * Ensure a company CA identity has a human-readable CA ID (CAID-{company}-{seq}).
 * Backfills legacy rows that were created before ca_id was assigned.
 */
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

/**
 * Distinct CA IDs for a company with succession eligibility metadata.
 */
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
