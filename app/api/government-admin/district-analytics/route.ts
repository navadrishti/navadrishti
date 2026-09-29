import { NextRequest, NextResponse } from 'next/server';
import { assertGovernmentAdmin } from '@/lib/government-admin-auth';
import { authErrorResponse } from '@/lib/server-auth';
import { supabase } from '@/lib/db';
import { getErrorMessage } from '@/lib/utils';

type Milestone = {
  id: string;
  milestone_number: number;
  milestone_title: string;
  fulfillment_requirements: string;
  is_fulfilled: boolean;
  fulfilled_at: string | null;
};

type ProjectRow = Record<string, unknown> & {
  government_project_milestones: Milestone[] | null;
};

export async function GET(request: NextRequest) {
  try {
    const admin = await assertGovernmentAdmin(request);

    if (admin.role !== 'district_officer') {
      return NextResponse.json(
        { error: 'Only district officers can access district analytics' },
        { status: 403 }
      );
    }

    const districtName = admin.district_name;
    if (!districtName) {
      return NextResponse.json(
        { error: 'Your account has no district assigned' },
        { status: 400 }
      );
    }

    // Projects carry no location key; they are scoped by the district of the admin who created them.
    const { data: districtAdmins, error: adminsError } = await supabase
      .from('government_admin_accounts')
      .select('id, role, active')
      .eq('district_name', districtName);

    if (adminsError) throw adminsError;

    const creatorIds = (districtAdmins || []).map((row) => row.id);
    const fieldOfficersCount = (districtAdmins || []).filter(
      (row) => row.role === 'field_officer' && row.active
    ).length;

    let projects: ProjectRow[] = [];
    if (creatorIds.length > 0) {
      const { data, error: projectsError } = await supabase
        .from('government_projects')
        .select('*, government_project_milestones(id, milestone_number, milestone_title, fulfillment_requirements, is_fulfilled, fulfilled_at)')
        .in('created_by_government_admin_id', creatorIds)
        .order('created_at', { ascending: false });

      if (projectsError) throw projectsError;
      projects = (data || []) as ProjectRow[];
    }

    // No evidence table references government projects yet, so evidence counts stay at zero.
    const projectsWithAnalytics = projects.map(({ government_project_milestones, ...project }) => {
      const milestones = [...(government_project_milestones || [])].sort(
        (a, b) => a.milestone_number - b.milestone_number
      );
      const completedMilestones = milestones.filter((m) => m.is_fulfilled).length;
      const progress = milestones.length > 0
        ? Math.round((completedMilestones / milestones.length) * 100)
        : 0;

      return {
        ...project,
        milestone_count: milestones.length,
        milestones,
        progress_percentage: progress,
        total_evidence_submitted: 0,
        evidence_accepted: 0,
        evidence_rejected: 0,
        evidence_flagged: 0,
      };
    });

    const summary = {
      total_projects: projectsWithAnalytics.length,
      active_projects: projectsWithAnalytics.filter(
        (p) => !p.milestones.every((m) => m.is_fulfilled)
      ).length,
      completed_projects: projectsWithAnalytics.filter(
        (p) => p.milestones.every((m) => m.is_fulfilled)
      ).length,
      avg_progress: Math.round(
        projectsWithAnalytics.reduce((sum, p) => sum + p.progress_percentage, 0) /
          (projectsWithAnalytics.length || 1)
      ),
      total_milestones: projectsWithAnalytics.reduce((sum, p) => sum + p.milestone_count, 0),
      completed_milestones: projectsWithAnalytics.reduce(
        (sum, p) => sum + p.milestones.filter((m) => m.is_fulfilled).length,
        0
      ),
      total_evidence: 0,
      accepted_evidence: 0,
      rejected_evidence: 0,
      flagged_evidence: 0,
      field_officers_count: fieldOfficersCount,
    };

    return NextResponse.json({
      success: true,
      projects: projectsWithAnalytics,
      summary,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('District analytics error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to load district analytics' },
      { status: 500 }
    );
  }
}
