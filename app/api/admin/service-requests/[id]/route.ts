import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/admin-auth';

function safeParseJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimeline(value: unknown): { stored: string | null; label: string | null } {
  const text = String(value || '').trim();
  if (!text) return { stored: null, label: null };
  if (text.toLowerCase() === 'anytime') return { stored: null, label: 'Anytime' };
  return { stored: text, label: text };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;
    const requestId = Number(id);

    const serviceRequest = await db.serviceRequests.getById(requestId);
    if (!serviceRequest) {
      return NextResponse.json({ success: false, error: 'Service request not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: serviceRequest });
  } catch (error: any) {
    console.error('Admin service request fetch error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;
    const requestId = Number(id);
    const body = await request.json();

    const { data: existingRequest, error: fetchError } = await supabase
      .from('service_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError) throw fetchError;

    const existingRequirements = safeParseJson(existingRequest?.requirements);
    const existingProjectContext = safeParseJson(existingRequest?.project_context);
    const timeline = normalizeTimeline(body.timeline ?? existingRequest?.timeline);

    const nextRequirements = {
      ...existingRequirements,
      ...(body.requirements && typeof body.requirements === 'object' ? body.requirements : {}),
    };

    const nextProjectContext = {
      ...existingProjectContext,
      ...(body.project_context && typeof body.project_context === 'object' ? body.project_context : {}),
    };

    if (body.request_type !== undefined) {
      nextRequirements.request_type = String(body.request_type || '').trim();
    }

    if (body.category !== undefined) {
      nextRequirements.project_category = String(body.category || '').trim();
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) updatePayload.title = String(body.title || '').trim();
    if (body.description !== undefined) updatePayload.description = String(body.description || '').trim();
    if (body.category !== undefined) updatePayload.category = String(body.category || '').trim();
    if (body.location !== undefined) updatePayload.location = String(body.location || '').trim();
    if (body.status !== undefined) updatePayload.status = String(body.status || '').trim();
    if (body.request_type !== undefined) updatePayload.request_type = String(body.request_type || '').trim();
    if (body.estimated_budget !== undefined) updatePayload.estimated_budget = toNumberOrNull(body.estimated_budget);
    if (body.beneficiary_count !== undefined) updatePayload.beneficiary_count = toNumberOrNull(body.beneficiary_count);
    if (body.impact_description !== undefined) updatePayload.impact_description = String(body.impact_description || '').trim();
    if (body.contact_info !== undefined) updatePayload.contact_info = body.contact_info ? String(body.contact_info).trim() : null;
    if (body.project_id !== undefined) updatePayload.project_id = body.project_id || null;
    if (body.project_context !== undefined || body.category !== undefined) updatePayload.project_context = nextProjectContext;
    if (body.requirements !== undefined || body.title !== undefined || body.category !== undefined || body.request_type !== undefined) {
      updatePayload.requirements = JSON.stringify(nextRequirements);
    }

    if (body.timeline !== undefined) {
      updatePayload.timeline = timeline.stored;
      nextRequirements.timeline = timeline.label;
      updatePayload.requirements = JSON.stringify(nextRequirements);
    }

    if (body.target_amount !== undefined) updatePayload.target_amount = toNumberOrNull(body.target_amount);
    if (body.current_amount !== undefined) updatePayload.current_amount = toNumberOrNull(body.current_amount);
    if (body.target_quantity !== undefined) updatePayload.target_quantity = toNumberOrNull(body.target_quantity);
    if (body.current_quantity !== undefined) updatePayload.current_quantity = toNumberOrNull(body.current_quantity);

    const { data, error } = await supabase
      .from('service_requests')
      .update(updatePayload)
      .eq('id', requestId)
      .select(`
        *,
        requester:users!ngo_id(id, name, email, user_type, verification_status, profile_image),
        project:service_request_projects(id, title, status, exact_address, location)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Admin service request update error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;
    const requestId = Number(id);

    if (!Number.isFinite(requestId) || requestId <= 0) {
      return NextResponse.json({ error: 'Valid service request ID is required' }, { status: 400 });
    }

    const existingRequest = await db.serviceRequests.getById(requestId);
    if (!existingRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    await db.serviceRequests.delete(requestId);

    return NextResponse.json({ success: true, message: 'Service request deleted successfully' });
  } catch (error: any) {
    console.error('Admin service request delete error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}