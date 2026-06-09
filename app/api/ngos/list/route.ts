import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

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

    // fetch richer NGO data so we can score locally
    let query = supabase
      .from('users')
      .select('id, name, email, city, state_province, profile_data')
      .eq('user_type', 'ngo')

    if (q) {
      // lightweight server-side filter to reduce rows
      const qStr = `%${q}%`
      query = query.or(`name.ilike.${qStr},email.ilike.${qStr},city.ilike.${qStr},state_province.ilike.${qStr}`)
    }

    const { data: ngos, error } = await query.limit(250).order('name', { ascending: true });

    if (error) throw error;

    const rows = (ngos ?? []).map((ngo: any) => {
      const profile = ngo.profile_data && typeof ngo.profile_data === 'object' ? ngo.profile_data : {}
      return {
        id: ngo.id,
        name: ngo.name,
        email: ngo.email,
        city: ngo.city || profile.city || '',
        state: ngo.state_province || profile.state_province || '',
        impact_areas: Array.isArray(profile.impact_areas) ? profile.impact_areas : (typeof profile.impact_areas === 'string' ? profile.impact_areas.split(/[,;|]/).map((s: string) => s.trim()) : []),
        is_demo: profile.is_demo === true || String(ngo.name || '').toLowerCase().includes('demo') || String(ngo.email || '').toLowerCase().includes('demo')
      }
    }).filter((r: any) => !r.is_demo)

    if (!q) {
      return NextResponse.json({ success: true, ngos: rows.slice(0, limit) })
    }

    const tokens = tokenize(q)

    const scored = rows.map((r: any) => {
      let score = 0
      const hay = `${r.name} ${r.email} ${r.city} ${r.state} ${(r.impact_areas || []).join(' ')}`.toLowerCase()
      if (tokens.length === 0) score = 1
      for (const t of tokens) {
        if (hay.includes(t)) score += 10
      }
      // give stronger weight to city/state exact matches
      const qLower = q.toLowerCase()
      if (r.city && qLower.includes(r.city.toLowerCase())) score += 30
      if (r.state && qLower.includes(r.state.toLowerCase())) score += 20
      // impact area boost
      for (const area of (r.impact_areas || [])) {
        if (!area) continue
        for (const t of tokens) if (area.toLowerCase().includes(t)) score += 8
      }
      return { ...r, score }
    }).sort((a: any, b: any) => b.score - a.score)

    return NextResponse.json({ success: true, ngos: scored.slice(0, limit).map((r: any) => ({ id: r.id, name: r.name, email: r.email })) })
  } catch (error: any) {
    console.error('NGO list fetch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch NGO list', details: error.message }, { status: 500 });
  }
}