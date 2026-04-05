import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cause = searchParams.get('cause');
    const region = searchParams.get('region');
    const companyId = searchParams.get('company_id');
    const search = searchParams.get('search');

    let query = supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (cause) {
      query = query.ilike('cause', `%${cause}%`);
    }

    if (region) {
      query = query.ilike('region', `%${region}%`);
    }

    if (companyId) {
      query = query.eq('company_id', Number(companyId));
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,cause.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch campaigns:', error);
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
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
    const {
      title,
      description,
      cause,
      region,
      budget_inr,
      timeline,
      budget_breakdown,
      schedule_vii,
      sdg_alignment,
      impact_metrics,
      milestones
    } = body;

    if (!title || !cause || !region) {
      return NextResponse.json(
        { error: 'title, cause and region are required' },
        { status: 400 }
      );
    }

    const payload = {
      company_id: user.id,
      title,
      description: description ?? null,
      cause,
      region,
      budget_inr: budget_inr ?? null,
      timeline: timeline ?? null,
      budget_breakdown: budget_breakdown ?? {},
      schedule_vii: schedule_vii ?? null,
      sdg_alignment: sdg_alignment ?? [],
      impact_metrics: impact_metrics ?? {},
      milestones: milestones ?? []
    };

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
      event_payload: { title: data.title, cause: data.cause, region: data.region },
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
