import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

// GET - Fetch dashboard statistics based on user type
export async function GET(request: NextRequest) {
  try {
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    let stats = {};

    if (userType === 'ngo') {
      try {
        const [serviceOffers, serviceRequests] = await Promise.all([
          supabase
            .from('service_offers')
            .select('id, status')
            .eq('ngo_id', userId),
          
          supabase
            .from('service_requests')
            .select('id, status')
            .eq('ngo_id', userId)
        ]);

        const serviceOffersData = serviceOffers.data || [];
        const serviceRequestsData = serviceRequests.data || [];

        const serviceRequestIds = serviceRequestsData.map(sr => sr.id);
        const serviceOfferIds = serviceOffersData.map(so => so.id);

        const [serviceVolunteers, serviceHires] = await Promise.all([
          serviceRequestIds.length > 0 ? 
            supabase
              .from('service_volunteers')
              .select('id, status, service_request_id')
              .in('service_request_id', serviceRequestIds) :
            Promise.resolve({ data: [] }),
          
          serviceOfferIds.length > 0 ?
            supabase
              .from('service_clients') // Fixed table name
              .select('id, status, service_offer_id')
              .in('service_offer_id', serviceOfferIds) :
            Promise.resolve({ data: [] })
        ]);

        const serviceVolunteersData = serviceVolunteers.data || [];
        const serviceHiresData = serviceHires.data || [];

        stats = {
          serviceOffersPending: serviceOffersData.filter(s => s.status === 'active').length,
          serviceOffersCompleted: serviceOffersData.filter(s => s.status === 'completed').length,
          serviceRequestsPending: serviceRequestsData.filter(s => ['open', 'active'].includes(s.status)).length,
          serviceRequestsCompleted: serviceRequestsData.filter(s => s.status === 'completed').length,
          serviceRequestsAccepted: serviceVolunteersData.filter(v => v.status === 'accepted').length,
          totalServiceHires: serviceHiresData.filter(h => ['accepted', 'active', 'completed'].includes(h.status)).length,
          totalVolunteers: serviceVolunteersData.filter(v => ['accepted', 'active', 'completed'].includes(v.status)).length
        };
      } catch (error) {
        console.error('Error fetching NGO stats:', error);
        stats = {
          serviceOffersPending: 0,
          serviceOffersCompleted: 0,
          serviceRequestsPending: 0,
          serviceRequestsCompleted: 0,
          serviceRequestsAccepted: 0,
          totalServiceHires: 0,
          totalVolunteers: 0
        };
      }

    } else if (userType === 'company') {
      try {
        const [serviceHires, volunteerApplications] = await Promise.all([
          supabase
            .from('service_clients')
            .select('id, status')
            .eq('client_id', userId),
          
          supabase
            .from('service_volunteers')
            .select('id, status')
            .eq('volunteer_id', userId)
        ]);

        const serviceHiresData = serviceHires.data || [];
        const volunteerApplicationsData = volunteerApplications.data || [];

        stats = {
          acceptedServiceRequests: serviceHiresData.filter(s => s.status === 'accepted').length,
          acceptedServiceOffers: volunteerApplicationsData.filter(v => v.status === 'accepted').length,
        };
      } catch (error) {
        console.error('Error fetching Company stats:', error);
        stats = {
          acceptedServiceRequests: 0,
          acceptedServiceOffers: 0
        };
      }

    } else if (userType === 'individual') {
      try {
        const [volunteerApplications, serviceHires] = await Promise.all([
          supabase
            .from('service_volunteers')
            .select('id, status')
            .eq('volunteer_id', userId),
          
          supabase
            .from('service_clients')
            .select('id, status')
            .eq('client_id', userId)
        ]);

        const volunteerApplicationsData = volunteerApplications.data || [];
        const serviceHiresData = serviceHires.data || [];

        stats = {
          acceptedServiceRequests: volunteerApplicationsData.filter(v => v.status === 'accepted').length,
          acceptedServiceOffers: serviceHiresData.filter(s => s.status === 'accepted').length,
        };
      } catch (error) {
        console.error('Error fetching Individual stats:', error);
        stats = {
          acceptedServiceRequests: 0,
          acceptedServiceOffers: 0
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    );
  }
}