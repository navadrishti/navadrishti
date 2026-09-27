import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import {
  generatePlatformCAToken,
  verifyPlatformCAPassword,
  PLATFORM_CA_ACCOUNTS_TABLE,
} from '@/lib/platform-ca-auth';
import { setPlatformCaTokenCookie } from '@/lib/server-auth';
import { limitAttempts } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { username, password } = body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return NextResponse.json({ error: 'username and password required' }, { status: 400 });
    }

    const limited = limitAttempts(request, 'ca-login', username);
    if (limited) return limited;

    // Look up CA account by username (no CA ID required)
    const { data: account, error } = await supabase
      .from(PLATFORM_CA_ACCOUNTS_TABLE)
      .select('*')
      .eq('username', username)
      .eq('active', true)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const isValid = await verifyPlatformCAPassword(account.id, password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const token = generatePlatformCAToken(account);

    await supabase
      .from(PLATFORM_CA_ACCOUNTS_TABLE)
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

    setPlatformCaTokenCookie(response, token, 12 * 60 * 60);

    return response;
  } catch (error) {
    console.error('CA login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
