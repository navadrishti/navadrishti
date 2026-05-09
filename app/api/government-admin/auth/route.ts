import { NextRequest, NextResponse } from 'next/server';
import { generateGovernmentAdminToken, getGovernmentAdminFromRequest, verifyGovernmentAdminPassword } from '@/lib/government-admin-auth';
import { supabase } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    const identifier = String(username).trim();
    const passwordValue = String(password);

    let account = null;

    const usernameLookup = await supabase
      .from('government_admin_accounts')
      .select('*')
      .eq('username', identifier)
      .single();

    if (usernameLookup.data) {
      account = usernameLookup.data;
    } else {
      const emailLookup = await supabase
        .from('government_admin_accounts')
        .select('*')
        .eq('email', identifier)
        .single();
      account = emailLookup.data;
    }

    if (!account || account.active === false) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const isValid = await verifyGovernmentAdminPassword(account.id, passwordValue);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = generateGovernmentAdminToken(account);

    await supabase
      .from('government_admin_accounts')
      .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', account.id);

    const response = NextResponse.json({
      success: true,
      message: 'Government admin login successful',
      role: account.role,
      mustChangePassword: account.must_change_password,
      account: {
        id: account.id,
        username: account.username,
        email: account.email,
        display_name: account.display_name,
        role: account.role,
      },
    });

    response.cookies.set('govt-admin-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Government admin login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
