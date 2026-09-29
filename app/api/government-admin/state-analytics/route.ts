import { NextRequest, NextResponse } from 'next/server';
import { assertGovernmentAdmin } from '@/lib/government-admin-auth';
import { authErrorResponse } from '@/lib/server-auth';
import { supabase } from '@/lib/db';
import { getErrorMessage } from '@/lib/utils';

type DistrictSummary = {
  district_name: string;
  total_projects: number;
  active_projects: number;
  avg_progress: number;
  total_evidence: number;
  accepted_evidence: number;
  rejected_evidence: number;
  flagged_evidence: number;
  field_officers_count: number;
};

type ProjectWithMilestones = {
  id: string;
  created_by_government_admin_id: number | null;
  government_project_milestones: { is_fulfilled: boolean }[] | null;
};

export async function GET(request: NextRequest) {
  try {
    const admin = await assertGovernmentAdmin(request);

    if (admin.role !== 'state_officer') {
      return NextResponse.json(
        { error: 'Only state officers can access state analytics' },
        { status: 403 }
      );
    }

    const stateName = admin.state_name;
    if (!stateName) {
      return NextResponse.json(
        { error: 'Your account has no state assigned' },
        { status: 400 }
      );
    }

    // Projects carry no location key; they are grouped by the district of the admin who created them.
    const { data: stateAdmins, error: adminsError } = await supabase
      .from('government_admin_accounts')
      .select('id, role, active, district_name')
      .eq('state_name', stateName);

    if (adminsError) throw adminsError;

    const districtByAdminId = new Map<number, string>();
    const fieldOfficersByDistrict = new Map<string, number>();
    for (const row of stateAdmins || []) {
      const district = row.district_name || 'Unassigned';
      districtByAdminId.set(row.id, district);
      if (row.role === 'field_officer' && row.active) {
        fieldOfficersByDistrict.set(district, (fieldOfficersByDistrict.get(district) || 0) + 1);
      }
    }

    let projects: ProjectWithMilestones[] = [];
    if (districtByAdminId.size > 0) {
      const { data, error: projectsError } = await supabase
        .from('government_projects')
        .select('id, created_by_government_admin_id, government_project_milestones(is_fulfilled)')
        .in('created_by_government_admin_id', Array.from(districtByAdminId.keys()));

      if (projectsError) throw projectsError;
      projects = data || [];
    }

    const districtMap = new Map<string, { total: number; active: number; progressSum: number }>();
    for (const project of projects) {
      const district = districtByAdminId.get(Number(project.created_by_government_admin_id)) || 'Unassigned';
      const entry = districtMap.get(district) || { total: 0, active: 0, progressSum: 0 };
      const milestones = project.government_project_milestones || [];
      const completed = milestones.filter((m) => m.is_fulfilled).length;

      entry.total++;
      if (completed < milestones.length) entry.active++;
      entry.progressSum += milestones.length > 0 ? Math.round((completed / milestones.length) * 100) : 0;
      districtMap.set(district, entry);
    }

    // No evidence table references government projects yet, so evidence counts stay at zero.
    const districtSummaries: DistrictSummary[] = Array.from(districtMap.entries()).map(([district, data]) => ({
      district_name: district,
      total_projects: data.total,
      active_projects: data.active,
      avg_progress: data.total > 0 ? Math.round(data.progressSum / data.total) : 0,
      total_evidence: 0,
      accepted_evidence: 0,
      rejected_evidence: 0,
      flagged_evidence: 0,
      field_officers_count: fieldOfficersByDistrict.get(district) || 0,
    }));

    const summary = {
      total_districts: districtSummaries.length,
      total_projects: districtSummaries.reduce((sum, d) => sum + d.total_projects, 0),
      avg_progress: districtSummaries.length > 0
        ? Math.round(
            districtSummaries.reduce((sum, d) => sum + d.avg_progress, 0) / districtSummaries.length
          )
        : 0,
      total_evidence: 0,
      accepted_evidence: 0,
      rejected_evidence: 0,
      flagged_evidence: 0,
      total_field_officers: Array.from(fieldOfficersByDistrict.values()).reduce((sum, n) => sum + n, 0),
      districts: districtSummaries,
    };

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('State analytics error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to load state analytics' },
      { status: 500 }
    );
  }
}
