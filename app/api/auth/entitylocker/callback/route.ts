// EntityLocker OAuth callback handler
import { NextRequest, NextResponse } from 'next/server';
import { EntityLockerService } from '@/lib/entitylocker';
import { supabase } from '@/lib/db';

const entityLocker = new EntityLockerService();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(`${process.env.FRONTEND_URL}/verification?error=${error}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${process.env.FRONTEND_URL}/verification?error=missing_parameters`);
    }

    // Exchange code for token
    const tokenData = await entityLocker.exchangeCodeForToken(code, state);
    
    // Store the token for later use
    const table = tokenData.entityType === 'ngo' ? 'ngo_verifications' : 'company_verifications';
    await supabase
      .from(table)
      .update({ entitylocker_token: tokenData.accessToken })
      .eq('user_id', tokenData.userId);

    // Redirect back to verification page with success
    return NextResponse.redirect(`${process.env.FRONTEND_URL}/verification?success=true&type=${tokenData.entityType}`);

  } catch (error) {
    console.error('EntityLocker callback error:', error);
    return NextResponse.redirect(`${process.env.FRONTEND_URL}/verification?error=callback_failed`);
  }
}