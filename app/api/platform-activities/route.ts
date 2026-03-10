import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 30; // Cache for 30 seconds

export async function GET() {
  try {
    const activities = [];
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch recent marketplace listings (last 24 hours)
    try {
      const { data: listings } = await supabase
        .from('marketplace_listings')
        .select(`
          id,
          name,
          description,
          price,
          category,
          created_at,
          seller:users!seller_id (
            id,
            name,
            profile_image,
            user_type,
            verification_status
          )
        `)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(3);

      if (listings) {
        for (const listing of listings) {
          const seller = Array.isArray(listing.seller) ? listing.seller[0] : listing.seller;
          activities.push({
            id: `listing-${listing.id}`,
            type: 'listing',
            title: `added a new listing`,
            user: seller ? {
              id: seller.id,
              name: seller.name,
              profile_image: seller.profile_image,
              user_type: seller.user_type,
              verification_status: seller.verification_status
            } : null,
            timestamp: listing.created_at,
            metadata: {
              price: listing.price,
              category: listing.category
            },
            link: `/marketplace/product/${listing.id}`
          });
        }
      }
    } catch (err) {
      console.error('Error fetching listings:', err);
    }

    // Fetch recent service requests (last 24 hours)
    try {
      const { data: serviceRequests } = await supabase
        .from('service_requests')
        .select(`
          id,
          title,
          description,
          category,
          created_at,
          requester:users!requester_id (
            id,
            name,
            profile_image,
            user_type,
            verification_status
          )
        `)        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (serviceRequests) {
        for (const request of serviceRequests) {
          const requester = Array.isArray(request.requester) ? request.requester[0] : request.requester;
          activities.push({
            id: `service-request-${request.id}`,
            type: 'service_request',
            title: `posted a service request`,
            user: requester ? {
              id: requester.id,
              name: requester.name,
              profile_image: requester.profile_image,
              user_type: requester.user_type,
              verification_status: requester.verification_status
            } : null,
            timestamp: request.created_at,
            metadata: {
              category: request.category
            },
            link: `/service-requests/${request.id}`
          });
        }
      }
    } catch (err) {
      console.error('Error fetching service requests:', err);
    }

    // Fetch recent service offers (last 24 hours)
    try {
      const { data: serviceOffers } = await supabase
        .from('service_offers')
        .select(`
          id,
          title,
          description,
          category,
          created_at,
          provider:users!provider_id (
            id,
            name,
            profile_image,
            user_type,
            verification_status
          )
        `)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (serviceOffers) {
        for (const offer of serviceOffers) {
          const provider = Array.isArray(offer.provider) ? offer.provider[0] : offer.provider;
          activities.push({
            id: `service-offer-${offer.id}`,
            type: 'service_offer',
            title: `offered a new service`,
            user: provider ? {
              id: provider.id,
              name: provider.name,
              profile_image: provider.profile_image,
              user_type: provider.user_type,
              verification_status: provider.verification_status
            } : null,
            timestamp: offer.created_at,
            metadata: {
              category: offer.category
            },
            link: `/service-offers/${offer.id}`
          });
        }
      }
    } catch (err) {
      console.error('Error fetching service offers:', err);
    }

    // Fetch recent user registrations (last 24 hours)
    try {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, profile_image, user_type, verification_status, created_at, city')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (users) {
        for (const user of users) {
          activities.push({
            id: `user-${user.id}`,
            type: 'user_joined',
            title: `joined the platform`,
            user: {
              id: user.id,
              name: user.name,
              profile_image: user.profile_image,
              user_type: user.user_type,
              verification_status: user.verification_status
            },
            timestamp: user.created_at,
            metadata: {
              location: user.city
            },
            link: `/profile/${user.id}`
          });
        }
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }

    // Fetch recent completed orders (last 24 hours)
    try {
      const { data: orders } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          total_amount,
          created_at,
          updated_at,
          buyer:users!user_id (
            id,
            name,
            profile_image,
            user_type,
            verification_status
          )
        `)
        .eq('status', 'delivered')
        .gte('updated_at', twentyFourHoursAgo)
        .order('updated_at', { ascending: false })
        .limit(2);
      
      if (orders) {
        for (const order of orders) {
          const buyer = Array.isArray(order.buyer) ? order.buyer[0] : order.buyer;
          activities.push({
            id: `order-${order.id}`,
            type: 'order',
            title: `completed an order`,
            user: buyer ? {
              id: buyer.id,
              name: buyer.name,
              profile_image: buyer.profile_image,
              user_type: buyer.user_type,
              verification_status: buyer.verification_status
            } : null,
            timestamp: order.created_at,
            metadata: {
              price: order.total_amount
            },
            link: `/orders/${order.order_number}`
          });
        }
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
    }

    // Fetch recent posts (last 24 hours)
    try {
      const { data: posts, error: postsError } = await supabase
        .from('posts')
        .select(`
          id,
          content,
          created_at,
          author:users!author_id (
            id,
            name,
            profile_image,
            user_type,
            verification_status
          )
        `)        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (postsError) {
        console.error('Error fetching posts:', postsError);
      }
      
      if (posts) {
        for (const post of posts) {
          const author = Array.isArray(post.author) ? post.author[0] : post.author;
          activities.push({
            id: `post-${post.id}`,
            type: 'post',
            title: `posted`,
            user: author ? {
              id: author.id,
              name: author.name,
              profile_image: author.profile_image,
              user_type: author.user_type,
              verification_status: author.verification_status
            } : null,
            timestamp: post.created_at,
            link: `/posts/${post.id}`
          });
        }
      }
    } catch (err) {
      console.error('Error fetching posts:', err);
    }

    // Fetch announcements from database
    try {
      const { data: dbAnnouncements } = await supabase
        .from('platform_announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);

      if (dbAnnouncements) {
        for (const announcement of dbAnnouncements) {
          activities.push({
            id: announcement.id,
            type: announcement.type,
            title: announcement.title,
            timestamp: announcement.created_at,
            link: null
          });
        }
      }
    } catch (err) {
      console.error('Error fetching announcements:', err);
    }

    // Sort all activities by timestamp
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Limit to top 20 activities for better performance
    const limitedActivities = activities.slice(0, 20);

    return NextResponse.json({
      success: true,
      activities: limitedActivities,
      count: limitedActivities.length
    });
  } catch (error: any) {
    console.error('Error fetching platform activities:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch platform activities',
        activities: []
      },
      { status: 500 }
    );
  }
}
