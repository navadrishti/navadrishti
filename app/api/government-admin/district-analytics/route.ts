import { NextRequest, NextResponse } from 'next/server';
import { assertGovernmentAdmin, getGovernmentAdminFromRequest } from '@/lib/government-admin-auth';
import { supabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const admin = await assertGovernmentAdmin(request);

    // Only district officers can access this
    if (admin.role !== 'district_officer') {
      return NextResponse.json(
        { error: 'Only district officers can access district analytics' },
        { status: 403 }
      );
    }

    // Get district from the request or admin's assigned district
    const districtName = new URL(request.url).searchParams.get('district') || admin.district_name;
    if (!districtName) {
      return NextResponse.json(
        { error: 'District name is required' },
        { status: 400 }
      );
    }

    // Fetch all projects in this district
    const { data: projects, error: projectsError } = await supabase
      .from('government_projects')
      .select('*')
      .eq('district_name', districtName)
      .order('created_at', { ascending: false });

    if (projectsError) throw projectsError;

    // For each project, fetch milestones and generate mock evidence data
    const projectsWithAnalytics = await Promise.all(
      (projects || []).map(async (project) => {
        const { data: milestones, error: milestonesError } = await supabase
          .from('government_project_milestones')
          .select('*')
          .eq('project_id', project.id)
          .order('milestone_number', { ascending: true });

        if (milestonesError) throw milestonesError;

        // Mock evidence data for now
        const mockEvidence = {
          total_submitted: Math.floor(Math.random() * 30) + 5,
          accepted: Math.floor(Math.random() * 20) + 2,
          rejected: Math.floor(Math.random() * 5),
          flagged: Math.floor(Math.random() * 4),
        };

        const milestonesWithEvidence = (milestones || []).map((m, idx) => ({
          ...m,
          evidenceCount: Math.floor(Math.random() * 10) + 1,
          acceptedCount: Math.floor(Math.random() * 8),
          rejectedCount: Math.floor(Math.random() * 2),
          flaggedCount: Math.floor(Math.random() * 2),
        }));

        const completedMilestones = (milestones || []).filter((m) => m.is_fulfilled).length;
        const progress = milestones && milestones.length > 0
          ? Math.round((completedMilestones / milestones.length) * 100)
          : 0;

        return {
          ...project,
          milestone_count: milestones?.length || 0,
          milestones: milestonesWithEvidence,
          progress_percentage: progress,
          field_officers_assigned: Math.floor(Math.random() * 5) + 1,
          total_evidence_submitted: mockEvidence.total_submitted,
          evidence_accepted: mockEvidence.accepted,
          evidence_rejected: mockEvidence.rejected,
          evidence_flagged: mockEvidence.flagged,
        };
      })
    );

    // Calculate summary
    const summary = {
      total_projects: projectsWithAnalytics.length,
      active_projects: projectsWithAnalytics.filter(
        (p) => !p.milestones?.every((m: any) => m.is_fulfilled)
      ).length,
      completed_projects: projectsWithAnalytics.filter(
        (p) => p.milestones?.every((m: any) => m.is_fulfilled)
      ).length,
      avg_progress: Math.round(
        projectsWithAnalytics.reduce((sum, p) => sum + (p.progress_percentage || 0), 0) /
          (projectsWithAnalytics.length || 1)
      ),
      total_milestones: projectsWithAnalytics.reduce((sum, p) => sum + (p.milestone_count || 0), 0),
      completed_milestones: projectsWithAnalytics.reduce(
        (sum, p) => sum + (p.milestones?.filter((m: any) => m.is_fulfilled).length || 0),
        0
      ),
      total_evidence: projectsWithAnalytics.reduce(
        (sum, p) => sum + (p.total_evidence_submitted || 0),
        0
      ),
      accepted_evidence: projectsWithAnalytics.reduce((sum, p) => sum + (p.evidence_accepted || 0), 0),
      rejected_evidence: projectsWithAnalytics.reduce((sum, p) => sum + (p.evidence_rejected || 0), 0),
      flagged_evidence: projectsWithAnalytics.reduce((sum, p) => sum + (p.evidence_flagged || 0), 0),
      field_officers_count: projectsWithAnalytics.reduce(
        (sum, p) => sum + (p.field_officers_assigned || 0),
        0
      ),
    };

    return NextResponse.json({
      success: true,
      projects: projectsWithAnalytics,
      summary,
    });
  } catch (error: any) {
    console.error('District analytics error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load district analytics' },
      { status: 500 }
    );
  }
}
