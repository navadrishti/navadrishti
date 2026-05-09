import { NextRequest, NextResponse } from 'next/server';
import { assertGovernmentAdmin } from '@/lib/government-admin-auth';
import { supabase } from '@/lib/db';

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

export async function GET(request: NextRequest) {
  try {
    await assertGovernmentAdmin(request);

    const { data, error } = await supabase
      .from('government_projects')
      .select('id, title, description, timeline, location, milestone_count, created_at, updated_at, government_project_milestones(id, milestone_number, milestone_title, fulfillment_requirements, is_fulfilled, fulfilled_at)')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, projects: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await assertGovernmentAdmin(request);

    const { title, description, timeline, location, milestone_count, milestone_requirements } = await request.json();
    const projectTitle = normalizeText(title);
    const projectDescription = normalizeText(description);
    const timelineValue = normalizeText(timeline);
    const locationValue = normalizeText(location);
    const milestoneCount = Number(milestone_count);
    const milestoneRequirements = Array.isArray(milestone_requirements)
      ? milestone_requirements.map((value) => normalizeText(value)).filter(Boolean)
      : [];

    if (!projectTitle || !timelineValue || !locationValue) {
      return NextResponse.json({ error: 'Project title, timeline, and location are required' }, { status: 400 });
    }

    if (!Number.isFinite(milestoneCount) || milestoneCount <= 0) {
      return NextResponse.json({ error: 'Milestone count must be greater than 0' }, { status: 400 });
    }

    if (milestoneRequirements.length !== milestoneCount) {
      return NextResponse.json({ error: 'Milestone requirements count must match milestone count' }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabase
      .from('government_projects')
      .insert({
        title: projectTitle,
        description: projectDescription || null,
        timeline: timelineValue,
        location: locationValue,
        milestone_count: milestoneCount,
        created_by_government_admin_id: actor.id,
      })
      .select('id, title, description, timeline, location, milestone_count, created_at, updated_at')
      .single();

    if (projectError) throw projectError;

    const milestoneRows = milestoneRequirements.map((requirement, index) => ({
      project_id: project.id,
      milestone_number: index + 1,
      milestone_title: `Milestone ${index + 1}`,
      fulfillment_requirements: requirement,
      is_fulfilled: false,
    }));

    const { data: milestones, error: milestonesError } = await supabase
      .from('government_project_milestones')
      .insert(milestoneRows)
      .select('id, milestone_number, milestone_title, fulfillment_requirements, is_fulfilled, fulfilled_at')
      .order('milestone_number', { ascending: true });

    if (milestonesError) throw milestonesError;

    return NextResponse.json({
      success: true,
      project: {
        ...project,
        government_project_milestones: milestones || [],
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to create project' }, { status: 500 });
  }
}