import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/admin-auth';
import { deleteCampaignWithDependencies, formatCampaignDeleteError } from '@/lib/campaign-delete';

function safeJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonField(value: unknown, fallback: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return JSON.parse(trimmed);
  }
  return value;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  return text;
}

async function loadCampaign(id: string) {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;
    const campaign = await loadCampaign(id);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: campaign });
  } catch (error: any) {
    console.error('Admin campaign fetch error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await loadCampaign(id);
    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) updatePayload.title = String(body.title || '').trim() || null;
    if (body.description !== undefined) updatePayload.description = String(body.description || '').trim() || null;
    if (body.category !== undefined) updatePayload.category = String(body.category || '').trim();
    if (body.location !== undefined) updatePayload.location = String(body.location || '').trim();
    if (body.schedule_vii !== undefined) updatePayload.schedule_vii = String(body.schedule_vii || '').trim() || null;
    if (body.status !== undefined) updatePayload.status = String(body.status || '').trim() || 'draft';
    if (body.budget_inr !== undefined) updatePayload.budget_inr = toNumberOrNull(body.budget_inr);
    if (body.start_date !== undefined) updatePayload.start_date = normalizeDate(body.start_date);
    if (body.end_date !== undefined) updatePayload.end_date = normalizeDate(body.end_date);

    if (body.impact_metrics !== undefined) {
      updatePayload.impact_metrics = parseJsonField(body.impact_metrics, {});
    } else if (body.volunteer_requirement !== undefined) {
      updatePayload.impact_metrics = {
        ...safeJson(existing.impact_metrics),
        volunteer_requirement: String(body.volunteer_requirement || '').trim(),
      };
    }

    if (body.milestones !== undefined) {
      updatePayload.milestones = parseJsonField(body.milestones, []);
    }

    const { data, error } = await supabase
      .from('campaigns')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    let company = null;
    if (data?.company_id) {
      const { data: companyRow } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', Number(data.company_id))
        .maybeSingle();
      company = companyRow
        ? { id: Number(companyRow.id), name: String(companyRow.name || ''), email: companyRow.email ? String(companyRow.email) : null }
        : null;
    }

    return NextResponse.json({ success: true, data: { ...data, company } });
  } catch (error: any) {
    console.error('Admin campaign update error:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in impact metrics or milestones' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;

    const existing = await loadCampaign(id);
    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    await deleteCampaignWithDependencies(id);

    return NextResponse.json({ success: true, message: 'Campaign deleted successfully' });
  } catch (error: any) {
    console.error('Admin campaign delete error:', error);
    const message = formatCampaignDeleteError(error);
    const status = error?.code === '23503' ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
