import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { assertAdminUser } from '@/lib/admin-auth';
import {
  createGovernmentAdminAccount,
  createGovernmentBody,
  findGovernmentAdminAccountByRole,
  listGovernmentBodies,
  updateGovernmentAdminAccount,
  updateGovernmentBody,
} from '@/lib/government-admin-auth';
import { supabase } from '@/lib/db';

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function generateTemporaryPassword() {
  return randomBytes(8).toString('base64url');
}

export async function GET(request: NextRequest) {
  try {
    assertAdminUser(request);

    const [bodies, accountsResult] = await Promise.all([
      listGovernmentBodies(),
      supabase
        .from('government_admin_accounts')
        .select('id, government_body_id, username, email, display_name, role, active, must_change_password, last_login_at, created_at, updated_at, government_bodies(department_name, state_name)')
        .order('created_at', { ascending: false }),
    ]);

    const { data, error } = accountsResult;

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, bodies, accounts: data || [] });
  } catch (error: any) {
    console.error('List government admin accounts error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to load government admin accounts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = assertAdminUser(request);
    const { department_name, state_name, username, password, role } = await request.json();

    if (!department_name || !state_name || !username || !password || !role) {
      return NextResponse.json({ error: 'Role, department name, state name, username, and password are required' }, { status: 400 });
    }

    const roleValue = normalizeText(role);
    if (!['state_officer', 'district_officer', 'field_officer'].includes(roleValue)) {
      return NextResponse.json({ error: 'Valid role is required' }, { status: 400 });
    }

    const passwordValue = String(password || '').trim();
    const departmentName = normalizeText(department_name);
    const stateName = normalizeText(state_name);
    const usernameValue = String(username).trim();
    const emailValue = `${usernameValue.toLowerCase()}@${stateName.toLowerCase().replace(/\s+/g, '')}.gov.in`;

    if (roleValue === 'state_officer' || roleValue === 'district_officer') {
      const existingAccount = await findGovernmentAdminAccountByRole(roleValue as any);

      if (existingAccount) {
        const body = await updateGovernmentBody(existingAccount.government_body_id, {
          department_name: departmentName,
          state_name: stateName,
          is_active: true,
        });

        const account = await updateGovernmentAdminAccount(existingAccount.id, {
          government_body_id: body.id,
          username: usernameValue,
          email: emailValue,
          display_name: departmentName,
          role: roleValue as any,
          temporaryPassword: passwordValue,
          active: true,
          must_change_password: true,
          createdByAdminId: admin.id,
        });

        return NextResponse.json({
          success: true,
          action: 'updated',
          body,
          account: {
            id: account.id,
            government_body_id: account.government_body_id,
            username: account.username,
            email: account.email,
            display_name: account.display_name,
            role: account.role,
            active: account.active,
            must_change_password: account.must_change_password,
          },
          password: passwordValue,
        });
      }
    }

    const body = await createGovernmentBody({
      department_name: departmentName,
      state_name: stateName,
      createdByAdminId: admin.id,
    });

    const account = await createGovernmentAdminAccount({
      government_body_id: body.id,
      username: usernameValue,
      email: emailValue,
      display_name: departmentName,
      role: roleValue as any,
      temporaryPassword: passwordValue,
    });

    return NextResponse.json({
      success: true,
      action: 'created',
      body,
      account: {
        id: account.id,
        government_body_id: account.government_body_id,
        username: account.username,
        email: account.email,
        display_name: account.display_name,
        role: account.role,
        active: account.active,
        must_change_password: account.must_change_password,
      },
      password: passwordValue,
    });
  } catch (error: any) {
    console.error('Create government admin account error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create government admin account' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertAdminUser(request);
    const { accountId, action } = await request.json();

    if (!accountId || !['activate', 'deactivate'].includes(action)) {
      return NextResponse.json(
        { error: 'Valid accountId and action (activate/deactivate) are required' },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from('government_admin_accounts')
      .update({ active: action === 'activate' })
      .eq('id', accountId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      message: `Government admin account ${action}d successfully`,
    });
  } catch (error: any) {
    console.error('Update government admin account error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update government admin account' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertAdminUser(request);
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'accountId query parameter is required' }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from('government_admin_accounts')
      .delete()
      .eq('id', accountId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({
      success: true,
      message: 'Government admin account permanently deleted',
    });
  } catch (error: any) {
    console.error('Delete government admin account error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete government admin account' },
      { status: 500 }
    );
  }
}
