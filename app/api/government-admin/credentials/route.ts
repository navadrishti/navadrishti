import { NextRequest, NextResponse } from 'next/server';
import {
  assertGovernmentAdmin,
  createGovernmentAdminAccount,
  createGovernmentBody,
  findGovernmentAdminAccountByRole,
  updateGovernmentAdminAccount,
  updateGovernmentBody,
} from '@/lib/government-admin-auth';
import { supabase } from '@/lib/db';

type CredentialRole = 'state_officer' | 'district_officer' | 'field_officer';

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function isRole(value: string): value is CredentialRole {
  return value === 'state_officer' || value === 'district_officer' || value === 'field_officer';
}

export async function GET(request: NextRequest) {
  try {
    await assertGovernmentAdmin(request);

    const { data, error } = await supabase
      .from('government_admin_accounts')
      .select('id, username, display_name, role, active, must_change_password, state_name, district_name, created_at, government_bodies(department_name, state_name)')
      .in('role', ['state_officer', 'district_officer', 'field_officer'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, accounts: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load credentials' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await assertGovernmentAdmin(request);
    const { role, department_name, state_name, district_name, username, password, project_id } = await request.json();

    const roleValue = normalizeText(role);
    const departmentName = normalizeText(department_name);
    const stateName = normalizeText(state_name);
    const districtName = roleValue === 'district_officer' ? normalizeText(district_name) : null;
    const usernameValue = normalizeText(username);
    const passwordValue = String(password || '').trim();

    if (!isRole(roleValue)) {
      return NextResponse.json({ error: 'Valid role is required' }, { status: 400 });
    }

    if (!departmentName || !stateName || !usernameValue || !passwordValue) {
      return NextResponse.json({ error: 'Scope name, state name, username, and password are required' }, { status: 400 });
    }

    if (roleValue === 'district_officer' && !districtName) {
      return NextResponse.json({ error: 'District name is required for district officers' }, { status: 400 });
    }

    let scopedDepartmentName = departmentName;
    if (roleValue === 'field_officer') {
      const projectId = normalizeText(project_id);
      if (!projectId) {
        return NextResponse.json({ error: 'Project assignment is required for field officers' }, { status: 400 });
      }

      const { data: project, error: projectError } = await supabase
        .from('government_projects')
        .select('title')
        .eq('id', projectId)
        .maybeSingle();

      if (projectError) throw projectError;
      if (!project?.title) {
        return NextResponse.json({ error: 'Assigned project not found' }, { status: 400 });
      }

      scopedDepartmentName = `${departmentName} • ${project.title}`;
    }

    const emailValue = `${usernameValue.toLowerCase()}@${stateName.toLowerCase().replace(/\s+/g, '')}.gov.in`;

    if (roleValue === 'state_officer' || roleValue === 'district_officer') {
      const existing = await findGovernmentAdminAccountByRole(roleValue);

      if (existing) {
        const body = await updateGovernmentBody(existing.government_body_id, {
          department_name: scopedDepartmentName,
          state_name: stateName,
          is_active: true,
        });

        const account = await updateGovernmentAdminAccount(existing.id, {
          government_body_id: body.id,
          username: usernameValue,
          email: emailValue,
          display_name: scopedDepartmentName,
          role: roleValue,
          state_name: stateName,
          district_name: districtName,
          temporaryPassword: passwordValue,
          active: true,
          must_change_password: true,
          createdByAdminId: actor.id,
        });

        return NextResponse.json({
          success: true,
          action: 'updated',
          account,
          password: passwordValue,
        });
      }
    }

    const body = await createGovernmentBody({
      department_name: scopedDepartmentName,
      state_name: stateName,
      createdByAdminId: actor.id,
    });

    const account = await createGovernmentAdminAccount({
      government_body_id: body.id,
      username: usernameValue,
      email: emailValue,
      display_name: scopedDepartmentName,
      role: roleValue,
      state_name: stateName,
      district_name: districtName,
      temporaryPassword: passwordValue,
      createdByAdminId: actor.id,
    });

    return NextResponse.json({
      success: true,
      action: 'created',
      account,
      password: passwordValue,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to generate credential' }, { status: 500 });
  }
}