import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    assertAdminUser(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const limit = Math.min(Number(searchParams.get('limit') || '200'), 500);

    let query = supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`title.ilike.${term},description.ilike.${term},category.ilike.${term},location.ilike.${term},schedule_vii.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const companyIds = [...new Set(rows.map((row) => Number(row.company_id || 0)).filter((id) => id > 0))];
    let companyById: Record<number, { id: number; name: string; email: string | null }> = {};

    if (companyIds.length > 0) {
      const { data: companies } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', companyIds);

      companyById = Object.fromEntries(
        (companies ?? []).map((company) => [
          Number(company.id),
          {
            id: Number(company.id),
            name: String(company.name || '').trim(),
            email: company.email ? String(company.email) : null,
          },
        ])
      );
    }

    const campaigns = rows.map((row) => ({
      ...row,
      company: row.company_id ? companyById[Number(row.company_id)] || null : null,
    }));

    return NextResponse.json({ success: true, campaigns });
  } catch (error: any) {
    console.error('Admin campaigns fetch error:', error);
    if (error?.message === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
