import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';

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
        profile_image,
        location,
        city,
        state_province,
        profile_data,
        ngo_verifications!inner(verification_status, sector)
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

    let ngos = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      profile_image: row.profile_image ?? null,
      location: row.city
        ? [row.city, row.state_province].filter(Boolean).join(', ')
        : (row.location ?? null),
      sector: (Array.isArray(row.ngo_verifications)
        ? row.ngo_verifications[0]?.sector
        : row.ngo_verifications?.sector) ?? null,
    }));

    // Apply optional filters in-process (lightweight, verified set is small)
    if (search) {
      const q = search.toLowerCase();
      ngos = ngos.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          (n.location ?? '').toLowerCase().includes(q) ||
          (n.sector ?? '').toLowerCase().includes(q)
      );
    }

    if (sector) {
      ngos = ngos.filter(
        (n) => (n.sector ?? '').toLowerCase() === sector.toLowerCase()
      );
    }

    const sectors = Array.from(
      new Set(
        (data ?? []).map((r: any) => {
          const ngoVer = r.ngo_verifications;
          return Array.isArray(ngoVer) ? ngoVer[0]?.sector : ngoVer?.sector;
        }).filter(Boolean)
      )
    ).sort();

    return Response.json({ success: true, ngos, sectors });
  } catch (err: any) {
    console.error('NGO network error:', err);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
