import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, supabase } from '@/lib/db';
import { comparePassword, hashPassword } from '@/lib/auth';
import { clearAuthTokenCookie, findAuthUser } from '@/lib/server-auth';

// Validation schema
const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  confirmation: z.string().refine(
    (value) => value === 'DELETE MY ACCOUNT',
    'You must type "DELETE MY ACCOUNT" to confirm'
  )
});

async function mustSucceed(query: PromiseLike<{ error: unknown }>) {
  const { error } = await query;
  if (error) throw error;
}

/**
 * Accounts are anonymised rather than removed: payments, reviews and contributions reference the
 * user row, and a hard delete either fails on those keys or wipes records other people rely on.
 */
async function closeAccount(userId: number) {
  const now = new Date().toISOString();

  await mustSucceed(
    supabase.from('service_offers').update({ status: 'inactive', updated_at: now }).eq('creator_id', userId).eq('status', 'active')
  );
  await mustSucceed(
    supabase.from('service_requests').update({ status: 'cancelled', updated_at: now }).eq('ngo_id', userId).eq('status', 'active')
  );
  await mustSucceed(supabase.from('user_addresses').delete().eq('user_id', userId));

  await mustSucceed(
    supabase
      .from('users')
      .update({
        email: `deleted-${userId}-${randomUUID()}@deleted.invalid`,
        name: 'Deleted user',
        phone: null,
        password: await hashPassword(randomUUID()),
        profile_image: null,
        profile_data: { account_deleted_at: now },
        account_status: 'suspended',
        email_verified: false,
        phone_verified: false,
        two_factor_enabled: false,
        updated_at: now,
      })
      .eq('id', userId)
  );
}

export async function DELETE(req: NextRequest) {
  try {
    const payload = findAuthUser(req);
    if (!payload) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = payload.id;
    
    const body = await req.json();
    const validationResult = deleteAccountSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        error: validationResult.error.errors[0].message 
      }, { status: 400 });
    }
    
    const { password } = validationResult.data;
    
    const user = await db.users.findByIdWithPassword(userId);
    
    if (!user) {
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    const isPasswordValid = await comparePassword(password, user.password);
    
    if (!isPasswordValid) {
      return NextResponse.json({ 
        error: 'Incorrect password' 
      }, { status: 400 });
    }
    
    try {
      await closeAccount(userId);
    } catch (closeError) {
      console.error('Error deleting user account:', closeError);
      return NextResponse.json({ 
        error: 'Failed to delete account' 
      }, { status: 500 });
    }
    
    const response = NextResponse.json({
      message: 'Account has been successfully deleted',
      success: true
    });

    clearAuthTokenCookie(response);

    return response;
    
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json({ 
      error: 'An error occurred while deleting your account' 
    }, { status: 500 });
  }
}