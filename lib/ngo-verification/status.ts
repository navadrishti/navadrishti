import { supabase } from '@/lib/db';
import { parseJsonObject } from '@/lib/utils';

export async function getNgoVerificationStatus(userId: number) {
  const { data: verification, error } = await supabase
    .from('ngo_verifications')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !verification) {
    return {
      verified: false,
      gstVerified: false,
      panVerified: false,
      status: 'unverified'
    };
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('verification_status, profile_data')
    .eq('id', userId)
    .single();

  const profileData = (userRow?.profile_data && typeof userRow.profile_data === 'object')
    ? userRow.profile_data
    : {};
  // Prefer table columns; fall back to interim profile mirror until pass-4 SQL is applied
  const tax = parseJsonObject((profileData as Record<string, unknown>).ngo_tax_verification);
  // users.verification_status is the admin override — if admin explicitly downgraded,
  // that wins regardless of what the ngo_verifications table says.
  const adminStatus = String(userRow?.verification_status || '').trim().toLowerCase();
  const effectiveStatus = (adminStatus === 'unverified' || adminStatus === 'suspended' || adminStatus === 'pending')
    ? adminStatus
    : adminStatus === 'verified'
      ? 'verified'
      : (verification.verification_status || 'unverified');

  return {
    verified: effectiveStatus === 'verified',
    gstVerified: Boolean(verification.gst_verified ?? tax.gst_verified),
    panVerified: Boolean(verification.pan_verified ?? tax.pan_verified),
    organizationName: verification.ngo_name,
    registrationNumber: verification.registration_number,
    registrationType: verification.registration_type,
    status: effectiveStatus,
    verification_status: effectiveStatus,
    reverification_pending: Boolean((profileData as Record<string, unknown>).reverification_pending),
    verifiedAt: verification.verification_date,
    fcraNumber: verification.fcra_number
  };
}
