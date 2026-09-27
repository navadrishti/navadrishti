import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, supabase } from '@/lib/db';
import { comparePassword } from '@/lib/auth';
import { clearAuthTokenCookie, findAuthUser } from '@/lib/server-auth';

// Validation schema
const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  confirmation: z.string().refine(
    (value) => value === 'DELETE MY ACCOUNT',
    'You must type "DELETE MY ACCOUNT" to confirm'
  )
});

async function deleteUserData(userId: number) {
  try {
    
    await supabase
      .from('user_addresses')
      .delete()
      .eq('user_id', userId);
    
    const serviceRequests = await supabase
      .from('service_requests')
      .select('id')
      .eq('ngo_id', userId);
    
    if (serviceRequests.data && serviceRequests.data.length > 0) {
      const requestIds = serviceRequests.data.map((req) => req.id);
      
      await supabase
        .from('service_request_applications')
        .delete()
        .in('service_request_id', requestIds);
      
      await supabase
        .from('service_requests')
        .delete()
        .eq('ngo_id', userId);
    }
    
    const serviceOffers = await supabase
      .from('service_offers')
      .select('id')
      .eq('creator_id', userId);
    
    if (serviceOffers.data && serviceOffers.data.length > 0) {
      const offerIds = serviceOffers.data.map((offer) => offer.id);
      
      await supabase
        .from('service_clients')
        .delete()
        .in('service_offer_id', offerIds);
      
      await supabase
        .from('service_offers')
        .delete()
        .eq('creator_id', userId);
    }
    
    await supabase
      .from('service_request_applications')
      .delete()
      .eq('applicant_user_id', userId);
    
    await supabase
      .from('service_clients')
      .delete()
      .eq('client_id', userId);
    
    await supabase
      .from('individual_verifications')
      .delete()
      .eq('user_id', userId);
    
    await supabase
      .from('ngo_verifications')
      .delete()
      .eq('user_id', userId);
    
    await supabase
      .from('company_verifications')
      .delete()
      .eq('user_id', userId);
    
  } catch (error) {
    console.error(`Error deleting user data for ${userId}:`, error);
    throw new Error('Failed to delete user data');
  }
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
    
    await deleteUserData(userId);
    
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);
    
    if (deleteError) {
      console.error('Error deleting user account:', deleteError);
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