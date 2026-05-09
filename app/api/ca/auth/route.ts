import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { generateNavadrishtCAToken } from '@/lib/navadrishti-ca-auth';
import { verifyNavadrishtCAPassword } from '@/lib/navadrishti-ca-auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'username and password required' }, { status: 400 });
    }

    // Look up CA account by username (no CA ID required)
    const { data: account, error } = await supabase
      .from('navadrishti_ca_accounts')
      .select('*')
      .eq('username', username)
      .eq('active', true)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Verify password
    const isValid = await verifyNavadrishtCAPassword(account.id, password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Generate CA token
    const token = generateNavadrishtCAToken(account);

    // Update last_login_at
    await supabase
      .from('navadrishti_ca_accounts')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', account.id);

    const response = NextResponse.json({
      success: true,
      message: 'CA login successful',
      must_change_password: account.must_change_password,
      account: {
        id: account.id,
        username: account.username,
        display_name: account.display_name,
      },
    });

    response.cookies.set('navadrishti-ca-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('CA login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}