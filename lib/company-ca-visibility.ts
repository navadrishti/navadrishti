import { supabase } from '@/lib/db';

export async function getCompanyCAUserIdSet(candidateUserIds?: number[]): Promise<Set<number>> {
  let query = supabase
    .from('company_ca_identities')
    .select('user_id');

  if (candidateUserIds && candidateUserIds.length > 0) {
    query = query.in('user_id', candidateUserIds);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((row) => Number(row.user_id)));
}

export async function isCompanyCAUser(userId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('company_ca_identities')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}