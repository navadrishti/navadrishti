import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

// Add cache control header
export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: NextRequest) {
  try {

    // Set a shorter timeout for database operations
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database timeout')), 3000); // 3 second timeout
    });

    // Run all queries in parallel for better performance
    const [usersResult, requestsResult] = await Promise.race([
      Promise.all([
        supabase
          .from('users')
          .select('user_type', { count: 'exact' }),
        supabase
          .from('service_requests')
          .select('*', { count: 'exact', head: true })
      ]),
      timeoutPromise
    ]) as any;

    const { data: allUsers, count: totalUsers, error: usersError } = usersResult;
    const { count: serviceRequestsCount, error: requestsError } = requestsResult;

    if (usersError) {
      console.error('Database error:', usersError);
      throw new Error('Database connection failed');
    }

    if (requestsError) {
      console.warn('Service requests error:', requestsError);
    }

    // Process user data locally for better performance
    const userCounts = allUsers?.reduce((acc: any, user: any) => {
      if (user.user_type === 'ngo') acc.ngos = (acc.ngos || 0) + 1;
      if (user.user_type === 'company') acc.companies = (acc.companies || 0) + 1;
      if (user.user_type === 'individual') acc.individuals = (acc.individuals || 0) + 1;
      return acc;
    }, { ngos: 0, companies: 0, individuals: 0 }) || { ngos: 0, companies: 0, individuals: 0 };

    const total = Number(totalUsers) || 0;
    const totalNGOs = userCounts.ngos;
    const totalCompanies = userCounts.companies;
    const totalServiceRequests = Number(serviceRequestsCount) || 0;



    const stats = {
      // ONLY REAL DATA - NO ESTIMATES OR SAMPLES
      activeUsers: total,
      
      // Partner NGOs (actual registered NGOs only)
      partnerNGOs: totalNGOs,
      
      // Partner Companies (actual registered companies only)
      partnerCompanies: totalCompanies,
      
      // Success stories (actual service requests only)
      successStories: totalServiceRequests,
      
      // Additional real stats only
      totalUsers: total,
      activeIndividuals: Math.max(0, total - totalNGOs - totalCompanies),
      activeServiceOffers: totalServiceRequests,
      totalVolunteers: 0, // Not displayed in hero section
      recentActivity: totalServiceRequests,
      
      // Legacy compatibility
      communitiesServed: total
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