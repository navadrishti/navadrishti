import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/server-auth';
import { createPlatformCAAccount, resetPlatformCAPasswordByAdmin, PLATFORM_CA_ACCOUNTS_TABLE } from '@/lib/platform-ca-auth';
import crypto from 'crypto';
import { getErrorMessage } from '@/lib/utils';

// Generate a random CA ID (new accounts only; existing DB rows keep their ca_id values)
function generateCaId(): string {
  const randomSuffix = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `ND-CA-${randomSuffix}`;
}

export async function GET(request: NextRequest) {
  try {
    assertAdminUser(request);
    
    const url = new URL(request.url);
    const query = url.searchParams.get('query');

    if (query === 'unique-ca-ids') {
      const { data, error } = await supabase
        .from(PLATFORM_CA_ACCOUNTS_TABLE)
        .select('ca_id, username, display_name, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by ca_id to show available CA IDs with their account count
      type CaAccount = NonNullable<typeof data>[number];
      const caIdMap = new Map<string, {
        ca_id: CaAccount['ca_id'];
        accounts: Pick<CaAccount, 'username' | 'display_name'>[];
        createdAt: CaAccount['created_at'];
      }>();
      data?.forEach((account) => {
        let group = caIdMap.get(account.ca_id);
        if (!group) {
          group = {
            ca_id: account.ca_id,
            accounts: [],
            createdAt: account.created_at,
          };
          caIdMap.set(account.ca_id, group);
        }
        group.accounts.push({
          username: account.username,
          display_name: account.display_name,
        });
      });

      return NextResponse.json({
        success: true,
        data: Array.from(caIdMap.values()),
      });
    }

    // Default: return all CA accounts
    const { data, error } = await supabase
      .from(PLATFORM_CA_ACCOUNTS_TABLE)
      .select('id, ca_id, username, display_name, active, must_change_password, last_login_at, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Get CA credentials error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to fetch CA credentials' },
      { status: getErrorMessage(error)?.includes('unauthorized') ? 401 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdminUser(request);

    const { ca_id: providedCaId, username, display_name, password, auto_generate_ca_id } = await request.json();

    if (!username || !display_name || !password) {
      return NextResponse.json(
        { error: 'username, display name, and password are required' },
        { status: 400 }
      );
    }

    // Determine CA ID: auto-generate if not provided, use provided one for reuse/succession
    let ca_id = providedCaId;
    if (auto_generate_ca_id || !providedCaId) {
      ca_id = generateCaId();
    }

    if (!ca_id) {
      return NextResponse.json(
        { error: 'CA ID generation failed' },
        { status: 500 }
      );
    }

    const { data: existing, error: checkError } = await supabase
      .from(PLATFORM_CA_ACCOUNTS_TABLE)
      .select('id')
      .eq('username', username)
      .eq('ca_id', ca_id)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existing) {
      return NextResponse.json(
        { error: 'CA account with this username already exists for the provided ca_id' },
        { status: 400 }
      );
    }

    const account = await createPlatformCAAccount({
      ca_id,
      username,
      display_name,
      temporaryPassword: password,
      createdByAdminId: -1,
    });

    return NextResponse.json({
      success: true,
      message: 'CA account created successfully',
      data: {
        id: account.id,
        ca_id: account.ca_id,
        username: account.username,
        display_name: account.display_name,
        active: account.active,
        must_change_password: account.must_change_password,
        created_at: account.created_at,
      },
    });
  } catch (error) {
    console.error('Create CA credentials error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to create CA credentials' },
      { status: getErrorMessage(error)?.includes('unauthorized') ? 401 : 500 }
    );
  }
}

// PUT: Deactivate CA account (keeps data, disables access)
export async function PUT(request: NextRequest) {
  try {
    assertAdminUser(request);

    const { accountId, action, password } = await request.json();

    if (!accountId || !action) {
      return NextResponse.json(
        { error: 'accountId and action are required' },
        { status: 400 }
      );
    }

    if (action === 'reset_password') {
      const newPassword = String(password || '').trim();
      if (newPassword.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 }
        );
      }

      const updatedAccount = await resetPlatformCAPasswordByAdmin(Number(accountId), newPassword);

      return NextResponse.json({
        success: true,
        message: 'CA password reset successfully. The CA must change it on next login.',
        data: {
          id: updatedAccount.id,
          ca_id: updatedAccount.ca_id,
          username: updatedAccount.username,
          display_name: updatedAccount.display_name,
          active: updatedAccount.active,
          must_change_password: updatedAccount.must_change_password,
          updated_at: updatedAccount.updated_at,
        },
      });
    }

    if (!['activate', 'deactivate'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "activate", "deactivate", or "reset_password"' },
        { status: 400 }
      );
    }

    const isActive = action === 'activate';

    const { data, error } = await supabase
      .from(PLATFORM_CA_ACCOUNTS_TABLE)
      .update({ active: isActive, updated_at: new Date().toISOString() })
      .eq('id', Number(accountId))
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: 'CA account not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `CA account ${action}d successfully`,
      data: {
        id: data.id,
        ca_id: data.ca_id,
        username: data.username,
        display_name: data.display_name,
        active: data.active,
        updated_at: data.updated_at,
      },
    });
  } catch (error) {
    console.error('Update CA account status error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to update CA account status' },
      { status: 500 }
    );
  }
}

// DELETE: Permanently delete CA account and all associated data
export async function DELETE(request: NextRequest) {
  try {
    assertAdminUser(request);

    const url = new URL(request.url);
    const accountId = url.searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    const { data: account, error: fetchError } = await supabase
      .from(PLATFORM_CA_ACCOUNTS_TABLE)
      .select('id, ca_id, username, display_name')
      .eq('id', Number(accountId))
      .single();

    if (fetchError || !account) {
      return NextResponse.json(
        { error: 'CA account not found' },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabase
      .from(PLATFORM_CA_ACCOUNTS_TABLE)
      .delete()
      .eq('id', Number(accountId));

    if (deleteError) throw deleteError;

    return NextResponse.json({
      success: true,
      message: 'CA account permanently deleted',
      data: {
        id: account.id,
        ca_id: account.ca_id,
        username: account.username,
        display_name: account.display_name,
      },
    });
  } catch (error) {
    console.error('Delete CA account error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to delete CA account' },
      { status: 500 }
    );
  }
}
