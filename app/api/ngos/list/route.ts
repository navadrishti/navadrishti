import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import {
  getCaComplianceTagExpiry,
  ngoIsCsrEligible,
  ngoIsCsrEligibleForWorkThrough,
  normalizeExpiryDate,
} from '@/lib/auth';

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => t.length > 2)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get('q') || '').trim();
    const limit = Number(searchParams.get('limit') || 30) || 30;
    const endDate = normalizeExpiryDate(searchParams.get('end_date') || searchParams.get('endDate'));

    // fetch richer NGO data so we can score locally
    let query = supabase
      .from('users')
      .select('id, name, email, city, state_province, profile_data, verification_status')
      .eq('user_type', 'ngo')

    if (q) {
      // lightweight server-side filter to reduce rows
      const qStr = `%${q}%`
      query = query.or(`name.ilike.${qStr},email.ilike.${qStr},city.ilike.${qStr},state_province.ilike.${qStr}`)
    }

    const { data: ngos, error } = await query.limit(250).order('name', { ascending: true });

    if (error) throw error;

    const rows = (ngos ?? [])
      .filter((ngo: any) => {
        const profile = ngo.profile_data && typeof ngo.profile_data === 'object' ? ngo.profile_data : {}
        const isDemo =
          profile.is_demo === true ||
          String(ngo.name || '').toLowerCase().includes('demo') ||
          String(ngo.email || '').toLowerCase().includes('demo')
        if (isDemo) return false
        if (endDate) {
          return ngoIsCsrEligibleForWorkThrough(ngo.verification_status, profile, endDate, {
            requireWorkEnd: true,
          })
        }
        return ngoIsCsrEligible(ngo.verification_status, profile)
      })
      .map((ngo: any) => {
      const profile = ngo.profile_data && typeof ngo.profile_data === 'object' ? ngo.profile_data : {}
      return {
        id: ngo.id,
        name: ngo.name,
        email: ngo.email,
        city: ngo.city || profile.city || '',
        state: ngo.state_province || profile.state_province || '',
        focus_areas: profile.focus_areas || profile.cause_areas || '',
        verification_status: ngo.verification_status,
        csr1_valid_until: getCaComplianceTagExpiry(profile, 'csr1'),
      }
    })

    // optional local relevance ranking if q provided
    const ranked = q
      ? rows
          .map((row) => {
            const hay = `${row.name} ${row.city} ${row.state} ${row.focus_areas}`.toLowerCase()
            const tokens = tokenize(q)
            const score = tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0)
            return { row, score }
          })
          .sort((a, b) => b.score - a.score)
          .map((entry) => entry.row)
      : rows

    return NextResponse.json({ success: true, data: ranked.slice(0, limit) });
  } catch (error) {
    console.error('NGO list error:', error);
    return NextResponse.json({ error: 'Failed to list NGOs' }, { status: 500 });
  }
}
