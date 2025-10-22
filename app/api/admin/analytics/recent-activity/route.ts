import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin-db';

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('admin_session')?.value;
    
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin session
    const sessionResult = await adminDb.adminSessions.findByToken(sessionToken);
    if (sessionResult.error || !sessionResult.data) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    // Get recent activity
    const activities = await getRecentActivity();
    
    return NextResponse.json({ activities });
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

async function getRecentActivity() {
  const { supabase } = await import('@/lib/db-supabase');
  
  try {
    // Get recent audit logs
    const { data: auditData } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    const activities = [];

    // Process audit logs into activities
    if (auditData && auditData.length > 0) {
      for (const log of auditData) {
        let description = '';
        let type = 'user_registration';

        switch (log.action) {
          case 'register':
            if (log.resource_type === 'user') {
              description = `New user registered: ${log.admin_email}`;
              type = 'user_registration';
            }
            break;
          case 'create':
            if (log.resource_type === 'order') {
              description = `New order placed`;
              type = 'order_placed';
            } else if (log.resource_type === 'product') {
              description = `New product listing created`;
              type = 'listing_created';
            }
            break;
          case 'verify':
            description = `User verification completed`;
            type = 'verification_completed';
            break;
          default:
            description = `${log.action} performed on ${log.resource_type}`;
        }

        activities.push({
          id: log.id.toString(),
          type,
          description,
          timestamp: log.created_at,
          userId: log.resource_id,
          userName: log.admin_email
        });
      }
    }

    // If no audit logs, get some sample recent activity from actual tables
    if (activities.length === 0) {
      // Get recent user registrations
      const { data: recentUsers } = await supabase
        .from('profiles')
        .select('id, full_name, created_at')
        .order('created_at', { ascending: false })
        .limit(3);

      if (recentUsers) {
        for (const user of recentUsers) {
          activities.push({
            id: `user_${user.id}`,
            type: 'user_registration',
            description: `New user registered: ${user.full_name || 'Anonymous'}`,
            timestamp: user.created_at,
            userId: user.id,
            userName: user.full_name
          });
        }
      }

      // Get recent orders if orders table exists
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('id, created_at')
        .order('created_at', { ascending: false })
        .limit(2);

      if (recentOrders) {
        for (const order of recentOrders) {
          activities.push({
            id: `order_${order.id}`,
            type: 'order_placed',
            description: `New order placed (#${order.id})`,
            timestamp: order.created_at
          });
        }
      }

      // Get recent products
      const { data: recentProducts } = await supabase
        .from('products')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(2);

      if (recentProducts) {
        for (const product of recentProducts) {
          activities.push({
            id: `product_${product.id}`,
            type: 'listing_created',
            description: `New listing: ${product.title}`,
            timestamp: product.created_at
          });
        }
      }
    }

    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return activities.slice(0, 10);
  } catch (error) {
    console.error('Error getting recent activity:', error);
    return [];
  }
}