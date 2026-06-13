import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth';
import { buildCampaignWritePayload, resolveCampaignCategoryInput, resolveCampaignLocationInput } from '@/lib/campaign-schema';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cause = searchParams.get('cause') || searchParams.get('category');
    const region = searchParams.get('region') || searchParams.get('location');
    const companyId = searchParams.get('company_id');
    const search = searchParams.get('search');

    let query = supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (cause) {
      query = query.ilike('category', `%${cause}%`);
    }

    if (region) {
      query = query.ilike('location', `%${region}%`);
    }

    if (companyId) {
      query = query.eq('company_id', Number(companyId));
    }

    if (search) {
      const term = `%${search.trim()}%`;
      query = query.or(`title.ilike."${term}",description.ilike."${term}",category.ilike."${term}",location.ilike."${term}",schedule_vii.ilike."${term}"`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch campaigns:', error);
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
    }

    const rows = data ?? [];
    const companyIds = [...new Set(rows.map((row) => Number(row.company_id || 0)).filter((id) => id > 0))];
    let companyNameById: Record<number, string> = {};

    if (companyIds.length > 0) {
      const { data: companies, error: companyError } = await supabase
        .from('users')
        .select('id, name')
        .in('id', companyIds);

      if (companyError) {
        console.error('Failed to fetch campaign company names:', companyError);
      } else {
        companyNameById = Object.fromEntries(
          (companies ?? []).map((company) => [Number(company.id), String(company.name || '').trim()])
        );
      }
    }

    const enriched = rows.map((row) => ({
      ...row,
      company_name: row.company_id ? companyNameById[Number(row.company_id)] || null : null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('Campaign list error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    assertUserType(user, ['company']);

    const body = await request.json();
    const category = resolveCampaignCategoryInput(body);
    const location = resolveCampaignLocationInput(body);

    if (!body.title || !category || !location) {
      return NextResponse.json(
        { error: 'title, category and location are required' },
        { status: 400 }
      );
    }

    const payload = buildCampaignWritePayload(body, user.id);

    const { data, error } = await supabase
      .from('campaigns')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('Failed to create campaign:', error);
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
    }

    await supabase.from('csr_audit_log').insert({
      entity_type: 'campaign',
      entity_id: data.id,
      event_type: 'campaign_created',
      event_hash: `campaign_created:${data.id}:${Date.now()}`,
      event_payload: { title: data.title, category: data.category, location: data.location },
      created_by: user.id
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('Campaign create error:', error);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}
