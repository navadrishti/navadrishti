'use server';

import { supabase } from '@/lib/db';

/**
 * Generate a unique CA ID for a specific company
 * Format: CAID-{COMPANY_ID}-{SEQUENCE}
 * Example: CAID-5-001, CAID-5-002, etc.
 */
export async function generateUniqueCompanyCaId(companyUserId: number): Promise<string> {
  // Get the highest sequence number for this company
  const { data: existingIds, error } = await supabase
    .from('company_ca_identities')
    .select('ca_id')
    .eq('company_user_id', companyUserId)
    .not('ca_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch existing CA IDs: ${error.message}`);
  }

  let nextSequence = 1;
  if (existingIds && existingIds.length > 0) {
    const lastCaId = existingIds[0].ca_id;
    const match = lastCaId.match(/CAID-\d+-(\d+)$/);
    if (match) {
      nextSequence = parseInt(match[1], 10) + 1;
    }
  }

  const newCaId = `CAID-${companyUserId}-${String(nextSequence).padStart(3, '0')}`;
  return newCaId;
}

/**
 * Get all available CA IDs for a company (for succession assignment)
 * Returns CA IDs that can be reassigned to new CA accounts
 */
export async function getAvailableCompanyCaIds(companyUserId: number) {
  const { data: caIds, error } = await supabase
    .from('company_ca_identities')
    .select('ca_id, user_id, users:user_id(name)')
    .eq('company_user_id', companyUserId)
    .not('ca_id', 'is', null)
    .order('ca_id', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch available CA IDs: ${error.message}`);
  }

  return caIds ?? [];
}

/**
 * Check if a CA ID is available for reuse within a company
 */
export async function isCompanyCaIdAvailableForReuse(companyUserId: number, caId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('company_ca_identities')
    .select('ca_id')
    .eq('company_user_id', companyUserId)
    .eq('ca_id', caId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 means no rows found, which is expected
    throw new Error(`Failed to check CA ID availability: ${error.message}`);
  }

  // Return true if the CA ID exists (can be reused) or false if it doesn't
  return !!data;
}
