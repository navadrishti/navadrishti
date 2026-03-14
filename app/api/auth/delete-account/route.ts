import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, supabase } from '@/lib/db';
import { comparePassword, verifyToken } from '@/lib/auth';

// Validation schema
const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  confirmation: z.string().refine(
    (value) => value === 'DELETE MY ACCOUNT',
    'You must type "DELETE MY ACCOUNT" to confirm'
  )
});

// Helper function to delete all user-related data
async function deleteUserData(userId: number, userEmail: string) {
  try {
    console.log(`🗑️ Starting data deletion for user ${userId} (${userEmail})`);
    
    // Delete user addresses
    await supabase
      .from('user_addresses')
      .delete()
      .eq('user_id', userId);
    
    // Delete service requests created by user (NGOs)
    const serviceRequests = await supabase
      .from('service_requests')
      .select('id')
      .or(`ngo_id.eq.${userId},company_id.eq.${userId}`);
    
    if (serviceRequests.data && serviceRequests.data.length > 0) {
      const requestIds = serviceRequests.data.map((req: any) => req.id);
      
      // Delete volunteers for these requests
      await supabase
        .from('service_volunteers')
        .delete()
        .in('service_request_id', requestIds);
      
      // Delete the service requests
      await supabase
        .from('service_requests')
        .delete()
        .or(`ngo_id.eq.${userId},company_id.eq.${userId}`);
    }
    
    // Delete service offers created by user (NGOs)
    const serviceOffers = await supabase
      .from('service_offers')
      .select('id')
      .eq('ngo_id', userId);
    
    if (serviceOffers.data && serviceOffers.data.length > 0) {
      const offerIds = serviceOffers.data.map((offer: any) => offer.id);
      
      // Delete clients for these offers
      await supabase
        .from('service_clients')
        .delete()
        .in('service_offer_id', offerIds);
      
      // Delete the service offers
      await supabase
        .from('service_offers')
        .delete()
        .eq('ngo_id', userId);
    }
    
    // Delete volunteer applications by user
    await supabase
      .from('service_volunteers')
      .delete()
      .eq('volunteer_id', userId);
    
    // Delete service client applications by user
    await supabase
      .from('service_clients')
      .delete()
      .eq('client_id', userId);
    
    // Delete verification records
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
    
    console.log(`✅ Successfully deleted all related data for user ${userId}`);
    
  } catch (error) {
    console.error(`❌ Error deleting user data for ${userId}:`, error);
    throw new Error('Failed to delete user data');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = payload.id;
    
    const body = await req.json();
    const validationResult = deleteAccountSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        error: validationResult.error.errors[0].message 
      }, { status: 400 });
    }
    
    const { password, confirmation } = validationResult.data;
    
    // Find the user
    const user = await db.users.findById(userId);
    
    if (!user) {
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }
    
    // Verify current password
    const isPasswordValid = await comparePassword(password, user.password);
    
    if (!isPasswordValid) {
      return NextResponse.json({ 
        error: 'Incorrect password' 
      }, { status: 400 });
    }
    
    console.log(`🚨 Account deletion requested for user: ${user.email} (ID: ${userId})`);
    
    // Delete all user-related data first
    await deleteUserData(userId, user.email);
    
    // Finally, delete the user account
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
    
    console.log(`💀 Account successfully deleted for user: ${user.email} (ID: ${userId})`);
    
    // Log the deletion for audit purposes
    console.log(`📋 AUDIT LOG: Account deleted - User ID: ${userId}, Email: ${user.email}, Date: ${new Date().toISOString()}`);
    
    return NextResponse.json({
      message: 'Account has been successfully deleted',
      success: true
    });
    
  } catch (error: any) {
    console.error('Delete account error:', error);
    return NextResponse.json({ 
      error: 'An error occurred while deleting your account' 
    }, { status: 500 });
  }
}