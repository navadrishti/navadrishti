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
      const [
        serviceOffers,
        serviceRequests,
        serviceHires,
        serviceVolunteers,
        marketplaceItems
      ] = await Promise.all([
        // Service offers created by this NGO
        supabase
          .from('service_offers')
          .select('id, status')
          .eq('ngo_id', userId),
        
        // Service requests created by this NGO
        supabase
          .from('service_requests')
          .select('id, status')
          .eq('ngo_id', userId),
        
        // Service hires (clients who hired this NGO's services)
        supabase
          .from('service_hires')
          .select(`
            id, status,
            service_offers(ngo_id)
          `)
          .eq('service_offers.ngo_id', userId)
          .in('status', ['accepted', 'active', 'completed']),
        
        // Volunteers who joined this NGO's service requests
        supabase
          .from('service_volunteers')
          .select(`
            id, status,
            service_requests(ngo_id)
          `)
          .eq('service_requests.ngo_id', userId)
          .in('status', ['accepted', 'active', 'completed']),
        
        // Marketplace items listed by this NGO
        supabase
          .from('marketplace_items')
          .select('id, status')
          .eq('seller_id', userId)
      ]);

      // Process the results
      const serviceOffersData = serviceOffers.data || [];
      const serviceRequestsData = serviceRequests.data || [];
      const serviceHiresData = serviceHires.data || [];
      const serviceVolunteersData = serviceVolunteers.data || [];
      const marketplaceItemsData = marketplaceItems.data || [];

      stats = {
        serviceOffersPending: serviceOffersData.filter(s => s.status === 'active').length,
        serviceOffersCompleted: serviceOffersData.filter(s => s.status === 'completed').length,
        serviceRequestsPending: serviceRequestsData.filter(s => ['open', 'active'].includes(s.status)).length,
        serviceRequestsAccepted: serviceRequestsData.filter(s => s.status === 'completed').length,
        marketplaceItemsListed: marketplaceItemsData.filter(m => m.status === 'active').length,
        marketplaceItemsSold: marketplaceItemsData.filter(m => m.status === 'sold').length,
        totalServiceHires: serviceHiresData.length,
        totalVolunteers: serviceVolunteersData.length
      };

    } else if (userType === 'company') {
      // Company Dashboard Stats - Real data from service and marketplace tables
      const [
        serviceHires,
        volunteerApplications,
        marketplaceListings,
        marketplaceOrders
      ] = await Promise.all([
        // Services hired by company from NGOs
        supabase
          .from('service_hires')
          .select('id, status')
          .eq('client_id', userId)
          .eq('client_type', 'company'),
        
        // Volunteer applications by company
        supabase
          .from('service_volunteers')
          .select('id, status')
          .eq('volunteer_id', userId)
          .eq('volunteer_type', 'company'),
        
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

      stats = {
        totalServiceRequests: serviceHiresData.length, // Services hired
        completedServiceRequests: serviceHiresData.filter(s => s.status === 'completed').length,
        acceptedServiceRequests: serviceHiresData.filter(s => ['accepted', 'active'].includes(s.status)).length,
        acceptedServiceOffers: volunteerApplicationsData.filter(v => v.status === 'accepted').length, // Volunteer applications accepted
        marketplaceItemsPurchased: marketplaceOrdersData.length,
        marketplaceItemsListed: marketplaceListingsData.length,
        marketplaceItemsSold: marketplaceListingsData.filter(m => m.status === 'sold').length
      };

    } else if (userType === 'individual') {
      // Individual Dashboard Stats - Real data from service and marketplace tables
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
          .eq('volunteer_id', userId)
          .eq('volunteer_type', 'individual'),
        
        // Services hired by individual from NGOs
        supabase
          .from('service_hires')
          .select('id, status')
          .eq('client_id', userId)
          .eq('client_type', 'individual'),
        
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

      stats = {
        totalVolunteerApplications: volunteerApplicationsData.length,
        acceptedVolunteerApplications: volunteerApplicationsData.filter(v => v.status === 'accepted').length,
        totalServiceRequests: serviceHiresData.length, // Services hired
        completedServiceRequests: serviceHiresData.filter(s => s.status === 'completed').length,
        totalServiceOffers: 0, // Individuals don't create service offers (only NGOs)
        availableServiceOffers: 0, // Individuals don't create service offers (only NGOs)
        acceptedServiceRequests: serviceHiresData.length, // Services hired
        acceptedServiceOffers: volunteerApplicationsData.filter(v => v.status === 'accepted').length, // Volunteer applications accepted
        marketplaceItemsPurchased: marketplaceOrdersData.length,
        marketplaceItemsListed: marketplaceListingsData.length,
        marketplaceItemsSold: marketplaceListingsData.filter(m => m.status === 'sold').length
      };
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