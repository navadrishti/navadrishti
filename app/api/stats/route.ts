import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

// Add cache control header
export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: NextRequest) {
  try {
    console.log('📊 Fetching platform statistics...');

    // Use faster single query approach
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('user_type');

    if (usersError) {
      console.error('Database error:', usersError);
      throw usersError;
    }

    // Get real service requests count
    const { count: serviceRequestsCount, error: requestsError } = await supabase
      .from('service_requests')
      .select('*', { count: 'exact', head: true });

    if (requestsError) {
      console.error('Service requests error:', requestsError);
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

    console.log('👥 User counts:', {
      total: totalUsers,
      ngos: totalNGOs,
      companies: totalCompanies,
      serviceRequests: totalServiceRequests
    });

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

  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch statistics',
        // NO SAMPLE DATA - only real zeros when database fails
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
        }
      },
      { status: 500 }
    );
  }
}