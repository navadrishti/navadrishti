import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/admin-auth';

function toNullableText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;

    const project = await db.requestProjects.getById(id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: project });
  } catch (error: any) {
    console.error('Admin project fetch error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;
    const body = await request.json();

    const { data: existingProject, error: fetchError } = await supabase
      .from('service_request_projects')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) updatePayload.title = String(body.title || '').trim();
    if (body.description !== undefined) updatePayload.description = String(body.description || '').trim();
    if (body.location !== undefined) updatePayload.location = String(body.location || '').trim();
    if (body.exact_address !== undefined) updatePayload.exact_address = String(body.exact_address || '').trim();
    if (body.timeline !== undefined) updatePayload.timeline = toNullableText(body.timeline);
    if (body.status !== undefined) updatePayload.status = String(body.status || '').trim();
    if (body.ngo_id !== undefined) updatePayload.ngo_id = body.ngo_id || null;

    const { data, error } = await supabase
      .from('service_request_projects')
      .update(updatePayload)
      .eq('id', id)
      .select(`
        *,
        ngo:users!ngo_id(id, name, email, user_type, verification_status, profile_image)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data, previous: existingProject });
  } catch (error: any) {
    console.error('Admin project update error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminUser(request);
    const { id } = await params;

    const project = await db.requestProjects.getById(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    await db.requestProjects.delete(id);

    return NextResponse.json({ success: true, message: 'Project deleted successfully' });
  } catch (error: any) {
    console.error('Admin project delete error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}