import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/admin-auth';
import { autoRejectExpiredServiceOffers } from '@/lib/admin-offer-automation';

async function safeQuery<T>(label: string, queryPromise: Promise<{ data: T | null; error: any }>, fallback: T) {
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

    const users = await safeQuery('users', supabase.from('users').select('id, user_type, verification_status, created_at'), [] as any[]);
    const offers = await safeQuery('service_offers', supabase.from('service_offers').select('id, admin_status, created_at, submitted_for_review_at'), [] as any[]);
    const allRequests = await safeQuery('service_requests summary', supabase.from('service_requests').select('id, status'), [] as any[]);
    const allProjects = await safeQuery('service_request_projects summary', supabase.from('service_request_projects').select('id, status'), [] as any[]);
    const allPosts = await safeQuery('posts summary', supabase.from('posts').select('id, visibility'), [] as any[]);
    const allTickets = await safeQuery('support_tickets summary', supabase.from('support_tickets').select('ticket_id, status'), [] as any[]);
    const allAnnouncements = await safeQuery('platform_announcements summary', supabase.from('platform_announcements').select('id'), [] as any[]);

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
      [] as any[],
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
      [] as any[],
    );

    const posts = await safeQuery(
      'posts recent',
      supabase
        .from('posts')
        .select(`
          id,
          content,
          category,
          visibility,
          created_at,
          published_at,
          reaction_count,
          comment_count,
          share_count,
          view_count,
          author:users!author_id(id, name, email, user_type, verification_status, profile_image)
        `)
        .order('created_at', { ascending: false })
        .limit(8),
      [] as any[],
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
      [] as any[],
    );

    const announcements = await safeQuery(
      'platform_announcements recent',
      supabase
        .from('platform_announcements')
        .select('id, type, title, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      [] as any[],
    );

    const countsByUserType = users.reduce((acc: Record<string, number>, user: any) => {
      const key = String(user.user_type || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const countsByVerification = users.reduce((acc: Record<string, number>, user: any) => {
      const key = String(user.verification_status || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const countsByOfferStatus = offers.reduce((acc: Record<string, number>, offer: any) => {
      const key = String(offer.admin_status || 'pending');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { pending: 0, approved: 0, rejected: 0 } as Record<string, number>);

    const countsByRequestStatus = requests.reduce((acc: Record<string, number>, requestItem: any) => {
      const key = String(requestItem.status || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const countsByProjectStatus = projects.reduce((acc: Record<string, number>, project: any) => {
      const key = String(project.status || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const countsByPostVisibility = posts.reduce((acc: Record<string, number>, post: any) => {
      const key = String(post.visibility || 'public');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const countsByTicketStatus = tickets.reduce((acc: Record<string, number>, ticket: any) => {
      const key = String(ticket.status || 'open');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          total_users: users.length,
          total_offers: offers.length,
          total_requests: allRequests.length,
          total_projects: allProjects.length,
          total_posts: allPosts.length,
          total_support_tickets: allTickets.length,
          total_announcements: allAnnouncements.length,
        },
        counts: {
          users_by_type: countsByUserType,
          users_by_verification: countsByVerification,
          offers_by_status: countsByOfferStatus,
          requests_by_status: allRequests.reduce((acc: Record<string, number>, requestItem: any) => {
            const key = String(requestItem.status || 'unknown');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          projects_by_status: allProjects.reduce((acc: Record<string, number>, project: any) => {
            const key = String(project.status || 'unknown');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          posts_by_visibility: allPosts.reduce((acc: Record<string, number>, post: any) => {
            const key = String(post.visibility || 'public');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          tickets_by_status: allTickets.reduce((acc: Record<string, number>, ticket: any) => {
            const key = String(ticket.status || 'open');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
        },
        recent: {
          service_requests: requests,
          service_request_projects: projects,
          posts,
          support_tickets: tickets,
          announcements,
        },
      },
    });
  } catch (error: any) {
    console.error('Admin overview fetch error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}