import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/server-auth';
import { autoRejectExpiredServiceOffers } from '@/lib/admin-offer-automation';
import { getErrorMessage } from '@/lib/utils';

async function safeQuery<T>(
  label: string,
  queryPromise: PromiseLike<{ data: T | null; error: unknown }>,
  fallback: NoInfer<T>
) {
  try {
    const result = await queryPromise;
    if (result.error) {
      console.error(`Admin overview ${label} query error:`, result.error);
      return fallback;
    }

    return (result.data ?? fallback) as T;
  } catch (error) {
    console.error(`Admin overview ${label} fetch failed:`, error);
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  try {
    assertAdminUser(request);

    await autoRejectExpiredServiceOffers();

    const users = await safeQuery('users', supabase.from('users').select('id, user_type, verification_status, created_at'), []);
    const offers = await safeQuery('service_offers', supabase.from('service_offers').select('id, admin_status, created_at, submitted_for_review_at'), []);
    const allRequests = await safeQuery('service_requests summary', supabase.from('service_requests').select('id, status'), []);
    const allProjects = await safeQuery('service_request_projects summary', supabase.from('service_request_projects').select('id, status'), []);
    const allTickets = await safeQuery('support_tickets summary', supabase.from('support_tickets').select('ticket_id, status'), []);

    const requests = await safeQuery(
      'service_requests recent',
      supabase
        .from('service_requests')
        .select(`
          id,
          title,
          status,
          request_type,
          category,
          location,
          created_at,
          updated_at,
          requester:users!ngo_id(id, name, email, user_type, verification_status),
          project:service_request_projects(id, title, status, exact_address, location)
        `)
        .order('created_at', { ascending: false })
        .limit(8),
      [],
    );

    const projects = await safeQuery(
      'service_request_projects recent',
      supabase
        .from('service_request_projects')
        .select(`
          id,
          title,
          status,
          location,
          exact_address,
          created_at,
          updated_at,
          ngo:users!ngo_id(id, name, email, user_type, verification_status)
        `)
        .order('created_at', { ascending: false })
        .limit(8),
      [],
    );

    const tickets = await safeQuery(
      'support_tickets recent',
      supabase
        .from('support_tickets')
        .select(`
          ticket_id,
          title,
          description,
          status,
          admin_notes,
          created_at,
          updated_at,
          user:users!user_id(id, name, email, user_type, verification_status, profile_image)
        `)
        .order('created_at', { ascending: false })
        .limit(8),
      [],
    );

    const countsByUserType = users.reduce((acc: Record<string, number>, user) => {
      const key = String(user.user_type || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const countsByVerification = users.reduce((acc: Record<string, number>, user) => {
      const key = String(user.verification_status || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const countsByOfferStatus = offers.reduce((acc: Record<string, number>, offer) => {
      const key = String(offer.admin_status || 'pending');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { pending: 0, approved: 0, rejected: 0 } as Record<string, number>);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          total_users: users.length,
          total_offers: offers.length,
          total_requests: allRequests.length,
          total_projects: allProjects.length,
          total_support_tickets: allTickets.length,
        },
        counts: {
          users_by_type: countsByUserType,
          users_by_verification: countsByVerification,
          offers_by_status: countsByOfferStatus,
          requests_by_status: allRequests.reduce((acc: Record<string, number>, requestItem) => {
            const key = String(requestItem.status || 'unknown');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          projects_by_status: allProjects.reduce((acc: Record<string, number>, project) => {
            const key = String(project.status || 'unknown');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          tickets_by_status: allTickets.reduce((acc: Record<string, number>, ticket) => {
            const key = String(ticket.status || 'open');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
        },
        recent: {
          service_requests: requests,
          service_request_projects: projects,
          support_tickets: tickets,
        },
      },
    });
  } catch (error) {
    console.error('Admin overview fetch error:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Internal server error' }, { status: 500 });
  }
}
