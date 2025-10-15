import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db';
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
        executeQuery({
          query: `
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as pending,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM service_offers WHERE ngo_id = ?
          `,
          values: [userId]
        }),
        // Service requests created by this NGO
        executeQuery({
          query: `
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status IN ('open', 'active') THEN 1 ELSE 0 END) as pending,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as accepted
            FROM service_requests WHERE ngo_id = ?
          `,
          values: [userId]
        }),
        // Service hires (clients who hired this NGO's services)
        executeQuery({
          query: `
            SELECT COUNT(*) as total
            FROM service_hires sh
            JOIN service_offers so ON sh.service_offer_id = so.id
            WHERE so.ngo_id = ? AND sh.status IN ('accepted', 'active', 'completed')
          `,
          values: [userId]
        }),
        // Volunteers who joined this NGO's service requests
        executeQuery({
          query: `
            SELECT COUNT(*) as total
            FROM service_volunteers sv
            JOIN service_requests sr ON sv.service_request_id = sr.id
            WHERE sr.ngo_id = ? AND sv.status IN ('accepted', 'active', 'completed')
          `,
          values: [userId]
        }),
        // Marketplace items listed by this NGO
        executeQuery({
          query: `
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as listed,
              SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold
            FROM marketplace_items WHERE seller_id = ?
          `,
          values: [userId]
        })
      ]);

      stats = {
        serviceOffersPending: (serviceOffers as any[])[0]?.pending || 0,
        serviceOffersCompleted: (serviceOffers as any[])[0]?.completed || 0,
        serviceRequestsPending: (serviceRequests as any[])[0]?.pending || 0,
        serviceRequestsAccepted: (serviceRequests as any[])[0]?.accepted || 0,
        marketplaceItemsListed: (marketplaceItems as any[])[0]?.listed || 0,
        marketplaceItemsSold: (marketplaceItems as any[])[0]?.sold || 0,
        totalServiceHires: (serviceHires as any[])[0]?.total || 0,
        totalVolunteers: (serviceVolunteers as any[])[0]?.total || 0
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
        executeQuery({
          query: `
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
              SUM(CASE WHEN status IN ('accepted', 'active') THEN 1 ELSE 0 END) as active
            FROM service_hires WHERE client_id = ? AND client_type = 'company'
          `,
          values: [userId]
        }),
        // Volunteer applications by company
        executeQuery({
          query: `
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted
            FROM service_volunteers WHERE volunteer_id = ? AND volunteer_type = 'company'
          `,
          values: [userId]
        }),
        // Marketplace listings by company
        executeQuery({
          query: `
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold
            FROM marketplace_items WHERE seller_id = ?
          `,
          values: [userId]
        }),
        // Orders made by company (as buyer)
        executeQuery({
          query: `
            SELECT 
              COUNT(*) as count,
              SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered
            FROM orders WHERE buyer_id = ?
          `,
          values: [userId]
        })
      ]);

      stats = {
        totalServiceRequests: (serviceHires as any[])[0]?.total || 0, // Services hired
        completedServiceRequests: (serviceHires as any[])[0]?.completed || 0,
        acceptedServiceRequests: (serviceHires as any[])[0]?.active || 0,
        acceptedServiceOffers: (volunteerApplications as any[])[0]?.accepted || 0, // Volunteer applications accepted
        marketplaceItemsPurchased: (marketplaceOrders as any[])[0]?.count || 0,
        marketplaceItemsListed: (marketplaceListings as any[])[0]?.total || 0,
        marketplaceItemsSold: (marketplaceListings as any[])[0]?.sold || 0
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
        executeQuery({
          query: `
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted
            FROM service_volunteers WHERE volunteer_id = ? AND volunteer_type = 'individual'
          `,
          values: [userId]
        }),
        // Services hired by individual from NGOs
        executeQuery({
          query: `
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM service_hires WHERE client_id = ? AND client_type = 'individual'
          `,
          values: [userId]
        }),
        // Marketplace listings by individual
        executeQuery({
          query: `
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold
            FROM marketplace_items WHERE seller_id = ?
          `,
          values: [userId]
        }),
        // Orders made by individual (as buyer)
        executeQuery({
          query: `
            SELECT 
              COUNT(*) as count,
              SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered
            FROM orders WHERE buyer_id = ?
          `,
          values: [userId]
        })
      ]);

      stats = {
        totalVolunteerApplications: (volunteerApplications as any[])[0]?.total || 0,
        acceptedVolunteerApplications: (volunteerApplications as any[])[0]?.accepted || 0,
        totalServiceRequests: (serviceHires as any[])[0]?.total || 0, // Services hired
        completedServiceRequests: (serviceHires as any[])[0]?.completed || 0,
        totalServiceOffers: 0, // Individuals don't create service offers (only NGOs)
        availableServiceOffers: 0, // Individuals don't create service offers (only NGOs)
        acceptedServiceRequests: (serviceHires as any[])[0]?.total || 0, // Services hired
        acceptedServiceOffers: (volunteerApplications as any[])[0]?.accepted || 0, // Volunteer applications accepted
        marketplaceItemsPurchased: (marketplaceOrders as any[])[0]?.count || 0,
        marketplaceItemsListed: (marketplaceListings as any[])[0]?.total || 0,
        marketplaceItemsSold: (marketplaceListings as any[])[0]?.sold || 0
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