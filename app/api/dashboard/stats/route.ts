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
      // NGO Dashboard Stats - Real data from service and marketplace tables
      try {
        // First get the service requests and offers by this NGO
        const [serviceOffers, serviceRequests, marketplaceItems] = await Promise.all([
          supabase
            .from('service_offers')
            .select('id, status')
            .eq('ngo_id', userId),
          
          supabase
            .from('service_requests')
            .select('id, status')
            .eq('ngo_id', userId),
          
          supabase
            .from('marketplace_items')
            .select('id, status')
            .eq('seller_id', userId)
        ]);

        const serviceOffersData = serviceOffers.data || [];
        const serviceRequestsData = serviceRequests.data || [];
        const marketplaceItemsData = marketplaceItems.data || [];

        // Get service request IDs to find volunteers
        const serviceRequestIds = serviceRequestsData.map(sr => sr.id);
        const serviceOfferIds = serviceOffersData.map(so => so.id);

        // Now get volunteers and hires for these specific requests/offers
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

        // Log for debugging
        console.log('NGO Dashboard Stats Debug:', {
          userId,
          serviceRequestIds,
          serviceOfferIds,
          serviceOffersCount: serviceOffersData.length,
          serviceRequestsCount: serviceRequestsData.length,
          serviceHiresCount: serviceHiresData.length,
          serviceVolunteersCount: serviceVolunteersData.length,
          marketplaceItemsCount: marketplaceItemsData.length,
          volunteerStatuses: serviceVolunteersData.map(v => ({ id: v.id, status: v.status }))
        });

        stats = {
          serviceOffersPending: serviceOffersData.filter(s => s.status === 'active').length,
          serviceOffersCompleted: serviceOffersData.filter(s => s.status === 'completed').length,
          serviceRequestsPending: serviceRequestsData.filter(s => ['open', 'active'].includes(s.status)).length,
          serviceRequestsCompleted: serviceRequestsData.filter(s => s.status === 'completed').length, // Add completed count
          serviceRequestsAccepted: serviceVolunteersData.filter(v => v.status === 'accepted').length, // Only accepted volunteers
          marketplaceItemsListed: marketplaceItemsData.filter(m => m.status === 'active').length,
          marketplaceItemsSold: marketplaceItemsData.filter(m => m.status === 'sold').length,
          totalServiceHires: serviceHiresData.filter(h => ['accepted', 'active', 'completed'].includes(h.status)).length, // Include completed hires
          totalVolunteers: serviceVolunteersData.filter(v => ['accepted', 'active', 'completed'].includes(v.status)).length // Include completed volunteers
        };
      } catch (error) {
        console.error('Error fetching NGO stats:', error);
        // Return default stats on error
        stats = {
          serviceOffersPending: 0,
          serviceOffersCompleted: 0,
          serviceRequestsPending: 0,
          serviceRequestsCompleted: 0, // Add completed count
          serviceRequestsAccepted: 0,
          marketplaceItemsListed: 0,
          marketplaceItemsSold: 0,
          totalServiceHires: 0,
          totalVolunteers: 0
        };
      }

    } else if (userType === 'company') {
      // Company Dashboard Stats - Real data from service and marketplace tables
      try {
        const [
          serviceHires,
          volunteerApplications,
          marketplaceListings,
          marketplaceOrders
        ] = await Promise.all([
          // Services hired by company from NGOs
          supabase
            .from('service_clients') // Fixed table name
            .select('id, status')
            .eq('client_id', userId),
          
          // Volunteer applications by company
          supabase
            .from('service_volunteers')
            .select('id, status')
            .eq('volunteer_id', userId),
          
          // Marketplace listings by company
          supabase
            .from('marketplace_items')
            .select('id, status')
            .eq('seller_id', userId),
          
          // Orders made by company (as buyer)
          supabase
            .from('orders')
            .select('id, status')
            .eq('buyer_id', userId)
        ]);

        // Process the results
        const serviceHiresData = serviceHires.data || [];
        const volunteerApplicationsData = volunteerApplications.data || [];
        const marketplaceListingsData = marketplaceListings.data || [];
        const marketplaceOrdersData = marketplaceOrders.data || [];

        // Log for debugging
        console.log('Company Dashboard Stats Debug:', {
          userId,
          serviceHiresCount: serviceHiresData.length,
          volunteerApplicationsCount: volunteerApplicationsData.length,
          marketplaceListingsCount: marketplaceListingsData.length,
          marketplaceOrdersCount: marketplaceOrdersData.length
        });

        stats = {
          acceptedServiceRequests: serviceHiresData.filter(s => s.status === 'accepted').length, // Only accepted
          acceptedServiceOffers: volunteerApplicationsData.filter(v => v.status === 'accepted').length,
          marketplaceItemsPurchased: marketplaceOrdersData.filter(o => ['confirmed', 'shipped', 'delivered'].includes(o.status)).length,
          marketplaceItemsSold: marketplaceListingsData.filter(m => m.status === 'sold').length
        };
      } catch (error) {
        console.error('Error fetching Company stats:', error);
        stats = {
          acceptedServiceRequests: 0,
          acceptedServiceOffers: 0,
          marketplaceItemsPurchased: 0,
          marketplaceItemsSold: 0
        };
      }

    } else if (userType === 'individual') {
      // Individual Dashboard Stats - Real data from service and marketplace tables
      try {
        const [
          volunteerApplications,
          serviceHires,
          marketplaceListings,
          marketplaceOrders
        ] = await Promise.all([
          // Volunteer applications by individual
          supabase
            .from('service_volunteers')
            .select('id, status')
            .eq('volunteer_id', userId),
          
          // Services hired by individual from NGOs
          supabase
            .from('service_clients') // Fixed table name
            .select('id, status')
            .eq('client_id', userId),
          
          // Marketplace listings by individual
          supabase
            .from('marketplace_items')
            .select('id, status')
            .eq('seller_id', userId),
          
          // Orders made by individual (as buyer)
          supabase
            .from('orders')
            .select('id, status')
            .eq('buyer_id', userId)
        ]);

        // Process the results
        const volunteerApplicationsData = volunteerApplications.data || [];
        const serviceHiresData = serviceHires.data || [];
        const marketplaceListingsData = marketplaceListings.data || [];
        const marketplaceOrdersData = marketplaceOrders.data || [];

        // Log for debugging
        console.log('Individual Dashboard Stats Debug:', {
          userId,
          volunteerApplicationsCount: volunteerApplicationsData.length,
          serviceHiresCount: serviceHiresData.length,
          marketplaceListingsCount: marketplaceListingsData.length,
          marketplaceOrdersCount: marketplaceOrdersData.length
        });

        stats = {
          acceptedServiceRequests: volunteerApplicationsData.filter(v => v.status === 'accepted').length, // Only accepted
          acceptedServiceOffers: serviceHiresData.filter(s => s.status === 'accepted').length, // Only accepted
          marketplaceItemsPurchased: marketplaceOrdersData.filter(o => ['confirmed', 'shipped', 'delivered'].includes(o.status)).length,
          marketplaceItemsSold: marketplaceListingsData.filter(m => m.status === 'sold').length
        };
      } catch (error) {
        console.error('Error fetching Individual stats:', error);
        stats = {
          acceptedServiceRequests: 0,
          acceptedServiceOffers: 0,
          marketplaceItemsPurchased: 0,
          marketplaceItemsSold: 0
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