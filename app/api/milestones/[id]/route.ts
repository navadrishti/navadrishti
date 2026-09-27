import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getEvidenceApproverContext, type EvidenceApproverContext } from '@/lib/server-auth';
import { getErrorMessage } from '@/lib/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: milestoneId } = await params;

    let approver: EvidenceApproverContext;
    try {
      approver = await getEvidenceApproverContext(request);
    } catch (error) {
      return NextResponse.json({ error: getErrorMessage(error) || 'CA authentication required' }, { status: 401 });
    }

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
      .select('id, company_user_id')
      .eq('id', milestone.project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    if (approver.companyUserId !== null && approver.companyUserId !== project.company_user_id) {
      return NextResponse.json({ error: 'Company CA is not authorized for this company project' }, { status: 403 });
    }

    const { data: evidenceRows, error: evidenceError } = await supabase
      .from('csr_milestone_evidence')
      .select('*')
      .eq('milestone_id', milestoneId)
      .order('captured_at', { ascending: false });

    if (evidenceError) {
      console.error('Failed to load milestone evidence:', evidenceError);
      return NextResponse.json({ error: 'Failed to load milestone' }, { status: 500 });
    }

    const evidenceIds = (evidenceRows || []).map((row) => row.id);
    const [{ data: media }, { data: documents }] = evidenceIds.length
      ? await Promise.all([
          supabase.from('csr_milestone_evidence_media').select('*').in('evidence_id', evidenceIds),
          supabase.from('csr_milestone_evidence_documents').select('*').in('evidence_id', evidenceIds),
        ])
      : [{ data: [] }, { data: [] }];

    const evidence = (evidenceRows || []).map((row) => ({
      ...row,
      media: (media || []).filter((item) => item.evidence_id === row.id),
      documents: (documents || []).filter((item) => item.evidence_id === row.id),
    }));

    return NextResponse.json({ success: true, data: { ...milestone, evidence } });
  } catch (error) {
    console.error('Milestone fetch error:', error);
    return NextResponse.json({ error: 'Failed to load milestone' }, { status: 500 });
  }
}
