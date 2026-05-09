import { NextRequest, NextResponse } from 'next/server';
import { assertGovernmentAdmin, getGovernmentAdminFromRequest } from '@/lib/government-admin-auth';
import { supabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const admin = await assertGovernmentAdmin(request);

    // Only state officers can access this
    if (admin.role !== 'state_officer') {
      return NextResponse.json(
        { error: 'Only state officers can access state analytics' },
        { status: 403 }
      );
    }

    // Get state from the request or admin's assigned state
    const stateName = new URL(request.url).searchParams.get('state') || admin.state_name;
    if (!stateName) {
      return NextResponse.json(
        { error: 'State name is required' },
        { status: 400 }
      );
    }

    // Fetch all projects in this state
    const { data: projects, error: projectsError } = await supabase
      .from('government_projects')
      .select('*')
      .eq('state_name', stateName)
      .order('created_at', { ascending: false });

    if (projectsError) throw projectsError;

    // Group projects by district and calculate analytics
    const districtMap = new Map<string, any>();

    await Promise.all(
      (projects || []).map(async (project) => {
        const district = project.district_name || 'Unassigned';

        if (!districtMap.has(district)) {
          districtMap.set(district, {
            district_name: district,
            total_projects: 0,
            active_projects: 0,
            progress_sum: 0,
            total_evidence: 0,
            accepted_evidence: 0,
            rejected_evidence: 0,
            flagged_evidence: 0,
            field_officers: new Set<number>(),
          });
        }

        const districtData = districtMap.get(district);

        // Fetch milestones
        const { data: milestones, error: milestonesError } = await supabase
          .from('government_project_milestones')
          .select('*')
          .eq('project_id', project.id);

        if (milestonesError) throw milestonesError;

        districtData.total_projects++;
        const completedMilestones = (milestones || []).filter((m) => m.is_fulfilled).length;
        const progress = milestones && milestones.length > 0
          ? Math.round((completedMilestones / milestones.length) * 100)
          : 0;

        if (completedMilestones < (milestones?.length || 0)) {
          districtData.active_projects++;
        }

        districtData.progress_sum += progress;

        // Mock evidence data
        const mockEvidence = {
          total: Math.floor(Math.random() * 30) + 5,
          accepted: Math.floor(Math.random() * 20) + 2,
          rejected: Math.floor(Math.random() * 5),
          flagged: Math.floor(Math.random() * 4),
        };

        districtData.total_evidence += mockEvidence.total;
        districtData.accepted_evidence += mockEvidence.accepted;
        districtData.rejected_evidence += mockEvidence.rejected;
        districtData.flagged_evidence += mockEvidence.flagged;

        // Add mock field officer
        districtData.field_officers.add(Math.floor(Math.random() * 100));
      })
    );

    // Convert to final format
    const districtSummaries = Array.from(districtMap.values()).map((data: any) => ({
      district_name: data.district_name,
      total_projects: data.total_projects,
      active_projects: data.active_projects,
      avg_progress: data.total_projects > 0 ? Math.round(data.progress_sum / data.total_projects) : 0,
      total_evidence: data.total_evidence,
      accepted_evidence: data.accepted_evidence,
      rejected_evidence: data.rejected_evidence,
      flagged_evidence: data.flagged_evidence,
      field_officers_count: data.field_officers.size,
    }));

    // Calculate state-level summary
    const summary = {
      total_districts: districtSummaries.length,
      total_projects: districtSummaries.reduce((sum: number, d: any) => sum + d.total_projects, 0),
      avg_progress: districtSummaries.length > 0
        ? Math.round(
            districtSummaries.reduce((sum: number, d: any) => sum + d.avg_progress, 0) /
              districtSummaries.length
          )
        : 0,
      total_evidence: districtSummaries.reduce((sum: number, d: any) => sum + d.total_evidence, 0),
      accepted_evidence: districtSummaries.reduce(
        (sum: number, d: any) => sum + d.accepted_evidence,
        0
      ),
      rejected_evidence: districtSummaries.reduce(
        (sum: number, d: any) => sum + d.rejected_evidence,
        0
      ),
      flagged_evidence: districtSummaries.reduce(
        (sum: number, d: any) => sum + d.flagged_evidence,
        0
      ),
      total_field_officers: districtSummaries.reduce(
        (sum: number, d: any) => sum + d.field_officers_count,
        0
      ),
      districts: districtSummaries,
    };

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: any) {
    console.error('State analytics error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load state analytics' },
      { status: 500 }
    );
  }
}
