import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';

function isFieldOfficerAccount(
  row: { name?: string | null },
  profileData: Record<string, unknown>,
  ngoVerification?: { ngo_name?: string | null } | null
) {
  if (profileData.is_field_officer === true) return true;

  const accountRole = String(profileData.account_role || profileData.role || '').toLowerCase();
  if (accountRole === 'field_officer' || accountRole === 'field officer') return true;

  const name = String(row.name || '').toLowerCase();
  if (name.includes('field officer')) return true;

  const ngoName = String(ngoVerification?.ngo_name || profileData.ngo_name || '').toLowerCase();
  if (ngoName.includes('field officer')) return true;

  return false;
}

function getNgoSize(profileData: Record<string, unknown>) {
  const size = profileData.team_strength ?? profileData.organization_size ?? null;
  if (size === null || size === undefined) return null;
  const text = String(size).trim();
  return text || null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const sector = searchParams.get('sector') || '';

    // Fetch NGOs where email AND phone are verified at the user level
    let query = supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        phone,
        profile_image,
        location,
        city,
        state_province,
        profile_data,
        ngo_verifications!inner(verification_status, sector, registration_type)
      `)
      .eq('user_type', 'ngo')
      .eq('email_verified', true)
      .eq('phone_verified', true)
      .eq('ngo_verifications.verification_status', 'verified')
      .order('name', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('NGO network query error:', error);
      return Response.json({ success: false, error: 'Failed to fetch NGO network' }, { status: 500 });
    }

    let ngos = (data ?? [])
      .filter((row: any) => {
        const profileData =
          row.profile_data && typeof row.profile_data === 'object' ? row.profile_data : {};
        const ngoVerification = Array.isArray(row.ngo_verifications)
          ? row.ngo_verifications[0]
          : row.ngo_verifications;
        return !isFieldOfficerAccount(row, profileData, ngoVerification);
      })
      .map((row: any) => {
        const profileData =
          row.profile_data && typeof row.profile_data === 'object' ? row.profile_data : {};
        const ngoVerification = Array.isArray(row.ngo_verifications)
          ? row.ngo_verifications[0]
          : row.ngo_verifications;

        return {
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone ?? null,
          profile_image: row.profile_image ?? null,
          location: row.city
            ? [row.city, row.state_province].filter(Boolean).join(', ')
            : (row.location ?? null),
          sector: ngoVerification?.sector ?? profileData.sector ?? null,
          registration_type: ngoVerification?.registration_type ?? null,
          execution_capacity: profileData.execution_capacity ?? null,
          size: getNgoSize(profileData),
        };
      });

    // Apply optional filters in-process (lightweight, verified set is small)
    if (search) {
      const q = search.toLowerCase();
      ngos = ngos.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          (n.location ?? '').toLowerCase().includes(q) ||
          (n.sector ?? '').toLowerCase().includes(q) ||
          (n.size ?? '').toLowerCase().includes(q) ||
          (n.execution_capacity ?? '').toLowerCase().includes(q) ||
          (n.registration_type ?? '').toLowerCase().includes(q)
      );
    }

    if (sector) {
      ngos = ngos.filter(
        (n) => (n.sector ?? '').toLowerCase() === sector.toLowerCase()
      );
    }

    const sectors = Array.from(
      new Set(
        ngos.map((n) => n.sector).filter(Boolean)
      )
    ).sort();

    return Response.json({ success: true, ngos, sectors });
  } catch (err: any) {
    console.error('NGO network error:', err);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
