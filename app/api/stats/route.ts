import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

// Add cache control header
export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: NextRequest) {
  try {

    // Set a timeout for database operations
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database timeout')), 5000); // 5 second timeout
    });

    // Get user data with timeout
    const userDataPromise = supabase
      .from('users')
      .select('user_type');

    const { data: allUsers, error: usersError } = await Promise.race([
      userDataPromise,
      timeoutPromise
    ]) as any;

    if (usersError) {
      console.error('Database error:', usersError);
      throw new Error('Database connection failed');
    }

    // Get real service requests count with timeout
    const requestsPromise = supabase
      .from('service_requests')
      .select('*', { count: 'exact', head: true });

    const { count: serviceRequestsCount, error: requestsError } = await Promise.race([
      requestsPromise,
      timeoutPromise
    ]) as any;

    if (requestsError) {
      console.warn('Service requests error:', requestsError);
    }

    // Process user data locally for better performance
    const userCounts = allUsers?.reduce((acc: any, user: any) => {
      acc.total = (acc.total || 0) + 1;
      if (user.user_type === 'ngo') acc.ngos = (acc.ngos || 0) + 1;
      if (user.user_type === 'company') acc.companies = (acc.companies || 0) + 1;
      if (user.user_type === 'individual') acc.individuals = (acc.individuals || 0) + 1;
      return acc;
    }, { total: 0, ngos: 0, companies: 0, individuals: 0 }) || { total: 0, ngos: 0, companies: 0, individuals: 0 };

    const totalUsers = userCounts.total;
    const totalNGOs = userCounts.ngos;
    const totalCompanies = userCounts.companies;
    const totalServiceRequests = Number(serviceRequestsCount) || 0;



    const stats = {
      // ONLY REAL DATA - NO ESTIMATES OR SAMPLES
      activeUsers: totalUsers,
      
      // Partner NGOs (actual registered NGOs only)
      partnerNGOs: totalNGOs,
      
      // Partner Companies (actual registered companies only)
      partnerCompanies: totalCompanies,
      
      // Success stories (actual service requests only)
      successStories: totalServiceRequests,
      
      // Additional real stats only
      totalUsers: totalUsers,
      activeIndividuals: Math.max(0, totalUsers - totalNGOs - totalCompanies),
      activeServiceOffers: totalServiceRequests,
      totalVolunteers: 0, // Not displayed in hero section
      recentActivity: totalServiceRequests,
      
      // Legacy compatibility
      communitiesServed: totalUsers
    };

    return NextResponse.json({ 
      success: true, 
      stats 
    });

  } catch (error: any) {
    console.error('Error fetching stats:', error);
    
    // Check if this is a connection timeout or 522 error
    const isConnectionIssue = error?.message?.includes('Connection timed out') || 
                             error?.message?.includes('522') ||
                             error?.message?.includes('Database timeout') ||
                             error?.message?.includes('Database connection failed');
    
    console.log('🔄 Database unavailable, returning zero stats for graceful degradation');
    
    return NextResponse.json(
      { 
        success: true, // Return success to prevent UI errors
        message: 'Database is temporarily unavailable. Stats will be updated once connection is restored.',
        stats: {
          activeUsers: 0,
          partnerNGOs: 0,
          partnerCompanies: 0,
          successStories: 0,
          totalUsers: 0,
          activeIndividuals: 0,
          activeServiceOffers: 0,
          totalVolunteers: 0,
          recentActivity: 0,
          communitiesServed: 0
        },
        databaseStatus: 'unavailable'
      },
      { status: 200 } // Return 200 instead of 500/503
    );
  }
}