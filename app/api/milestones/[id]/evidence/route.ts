import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = getAuthUserFromRequest(request);
    assertUserType(user, ['ngo']);

    const milestoneId = params.id;

    const { data: milestone, error: milestoneError } = await supabase
      .from('csr_project_milestones')
      .select('*')
      .eq('id', milestoneId)
      .single();

    if (milestoneError || !milestone) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    const { data: project, error: projectError } = await supabase
      .from('csr_projects')
      .select('*')
      .eq('id', milestone.project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.ngo_user_id !== user.id) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const {
      device_id,
      description,
      gps_lat,
      gps_long,
      gps_accuracy_meters,
      captured_at,
      evidence_summary,
      media,
      documents
    } = body;

    if (!device_id || !captured_at) {
      return NextResponse.json(
        { error: 'device_id and captured_at are required' },
        { status: 400 }
      );
    }

    const evidencePayload = {
      milestone_id: milestoneId,
      project_id: project.id,
      uploaded_by: user.id,
      ngo_user_id: user.id,
      device_id,
      description: description ?? null,
      gps_lat: gps_lat ?? null,
      gps_long: gps_long ?? null,
      gps_accuracy_meters: gps_accuracy_meters ?? null,
      captured_at,
      evidence_summary: evidence_summary ?? {},
      submission_status: 'submitted',
      immutable_hash: `evidence:${milestoneId}:${user.id}:${Date.now()}`
    };

    const { data: evidence, error: evidenceError } = await supabase
      .from('csr_milestone_evidence')
      .insert(evidencePayload)
      .select('*')
      .single();

    if (evidenceError) {
      console.error('Failed to submit evidence:', evidenceError);
      return NextResponse.json({ error: 'Failed to submit evidence' }, { status: 500 });
    }

    if (Array.isArray(media) && media.length > 0) {
      const mediaRows = media
        .filter((item: any) => item?.media_type && item?.media_url)
        .map((item: any) => ({
          evidence_id: evidence.id,
          media_type: item.media_type,
          media_url: item.media_url,
          mime_type: item.mime_type ?? null,
          file_name: item.file_name ?? null,
          file_size_bytes: item.file_size_bytes ?? null,
          captured_at: item.captured_at ?? null
        }));

      if (mediaRows.length > 0) {
        await supabase.from('csr_milestone_evidence_media').insert(mediaRows);
      }
    }

    if (Array.isArray(documents) && documents.length > 0) {
      const documentRows = documents
        .filter((item: any) => item?.document_url && item?.file_name)
        .map((item: any) => ({
          evidence_id: evidence.id,
          document_url: item.document_url,
          file_name: item.file_name,
          mime_type: item.mime_type ?? null,
          file_size_bytes: item.file_size_bytes ?? null
        }));

      if (documentRows.length > 0) {
        await supabase.from('csr_milestone_evidence_documents').insert(documentRows);
      }
    }

    await supabase
      .from('csr_project_milestones')
      .update({ status: 'submitted', updated_at: new Date().toISOString() })
      .eq('id', milestoneId);

    await supabase.from('csr_audit_log').insert({
      entity_type: 'evidence',
      entity_id: evidence.id,
      event_type: 'milestone_evidence_submitted',
      event_hash: `evidence_submitted:${evidence.id}:${Date.now()}`,
      event_payload: {
        milestone_id: milestoneId,
        project_id: project.id,
        uploaded_by: user.id
      },
      created_by: user.id
    });

    return NextResponse.json({ success: true, data: evidence }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('Milestone evidence submit error:', error);
    return NextResponse.json({ error: 'Failed to submit evidence' }, { status: 500 });
  }
}
