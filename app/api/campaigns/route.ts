import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth';
import { buildCampaignWritePayload, resolveCampaignCategoryInput, resolveCampaignLocationInput } from '@/lib/campaign-schema';
import { getCampaignLeadNgoId } from '@/lib/campaign-volunteer-attendance';

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
      // Company fetching their own campaigns — show all statuses (including drafts).
      query = query.eq('company_id', Number(companyId));
    } else {
      // Public discovery — hide drafts only.
      // campaign_status_enum does not include cancelled / rejected / closed.
      query = query.neq('status', 'draft');
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
    const leadNgoIds = [
      ...new Set(
        rows
          .map((row) => getCampaignLeadNgoId(row))
          .filter((id) => id > 0)
      ),
    ];
    const userIds = [...new Set([...companyIds, ...leadNgoIds])];
    let userMetaById: Record<number, { name: string; verification_status: string }> = {};

    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, verification_status')
        .in('id', userIds);

      if (usersError) {
        console.error('Failed to fetch campaign account names:', usersError);
      } else {
        userMetaById = Object.fromEntries(
          (users ?? []).map((user) => [
            Number(user.id),
            {
              name: String(user.name || '').trim(),
              verification_status: String(user.verification_status || '').trim().toLowerCase(),
            },
          ])
        );
      }
    }

    const enriched = rows.map((row) => {
      const company = row.company_id ? userMetaById[Number(row.company_id)] : null;
      const selectedLeadNgoId = getCampaignLeadNgoId(row);
      const leadNgo = selectedLeadNgoId > 0 ? userMetaById[selectedLeadNgoId] : null;
      return {
        ...row,
        lead_ngo_user_id: selectedLeadNgoId > 0 ? selectedLeadNgoId : row.lead_ngo_user_id || null,
        company_name: company?.name || null,
        company_verification_status: company?.verification_status || null,
        company_verified: company?.verification_status === 'verified',
        selected_lead_ngo_verification_status: leadNgo?.verification_status || null,
        selected_lead_ngo_verified: leadNgo?.verification_status === 'verified',
      };
    });

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
