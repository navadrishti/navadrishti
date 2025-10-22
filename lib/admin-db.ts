// Admin Database Utilities
// Production-ready database helpers for admin operations

import { supabase } from '@/lib/db-supabase';

export const adminDb = {
  // Admin Users
  adminUsers: {
    async findByEmail(email: string) {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .eq('is_active', true)
        .single();
      
      return { data, error };
    },

    async create(userData: any) {
      const { data, error } = await supabase
        .from('admin_users')
        .insert(userData)
        .select()
        .single();
      
      return { data, error };
    },

    async updateLastLogin(id: number) {
      const { data, error } = await supabase
        .from('admin_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', id);
      
      return { data, error };
    }
  },

  // Admin Sessions
  adminSessions: {
    async create(sessionData: any) {
      const { data, error } = await supabase
        .from('admin_sessions')
        .insert(sessionData)
        .select()
        .single();
      
      return { data, error };
    },

    async findByToken(token: string) {
      const { data, error } = await supabase
        .from('admin_sessions')
        .select(`
          *,
          admin_users!inner(id, email, name, role, permissions, is_active)
        `)
        .eq('session_token', token)
        .gte('expires_at', new Date().toISOString())
        .single();
      
      return { data, error };
    },

    async deleteByToken(token: string) {
      const { error } = await supabase
        .from('admin_sessions')
        .delete()
        .eq('session_token', token);
      
      return { error };
    },

    async cleanup() {
      const { error } = await supabase
        .from('admin_sessions')
        .delete()
        .lt('expires_at', new Date().toISOString());
      
      return { error };
    }
  },

  // Audit Logs
  auditLogs: {
    async create(logData: {
      admin_user_id?: number;
      admin_email: string;
      action: string;
      resource_type: string;
      resource_id?: string;
      old_values?: any;
      new_values?: any;
      ip_address?: string;
      user_agent?: string;
    }) {
      const { data, error } = await supabase
        .from('audit_logs')
        .insert({
          ...logData,
          old_values: logData.old_values ? JSON.stringify(logData.old_values) : null,
          new_values: logData.new_values ? JSON.stringify(logData.new_values) : null
        })
        .select()
        .single();
      
      return { data, error };
    },

    async getRecent(limit = 50) {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      return { data, error };
    },

    async getByResource(resourceType: string, resourceId: string) {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('resource_type', resourceType)
        .eq('resource_id', resourceId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    }
  },

  // Platform Analytics
  analytics: {
    async getDashboardStats() {
      try {
        // Get user statistics
        const { data: userStats } = await supabase
          .from('users')
          .select('user_type, verification_status, created_at');

        // Get marketplace statistics
        const { data: marketplaceStats } = await supabase
          .from('marketplace_items')
          .select('status, featured, category, price, created_at');

        // Get service statistics
        const { data: serviceRequestStats } = await supabase
          .from('service_requests')
          .select('status, category, created_at');

        const { data: serviceOfferStats } = await supabase
          .from('service_offers')
          .select('status, category, created_at');

        // Get order statistics
        const { data: orderStats } = await supabase
          .from('orders')
          .select('status, total_amount, created_at');

        // Process statistics
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const stats = {
          users: {
            total: userStats?.length || 0,
            individuals: userStats?.filter(u => u.user_type === 'individual').length || 0,
            ngos: userStats?.filter(u => u.user_type === 'ngo').length || 0,
            companies: userStats?.filter(u => u.user_type === 'company').length || 0,
            verified: userStats?.filter(u => u.verification_status === 'verified').length || 0,
            newThisWeek: userStats?.filter(u => new Date(u.created_at) >= sevenDaysAgo).length || 0,
            newThisMonth: userStats?.filter(u => new Date(u.created_at) >= thirtyDaysAgo).length || 0
          },
          marketplace: {
            total: marketplaceStats?.length || 0,
            active: marketplaceStats?.filter(i => i.status === 'active').length || 0,
            sold: marketplaceStats?.filter(i => i.status === 'sold').length || 0,
            featured: marketplaceStats?.filter(i => i.featured === true).length || 0,
            totalValue: marketplaceStats?.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0) || 0,
            newThisWeek: marketplaceStats?.filter(i => new Date(i.created_at) >= sevenDaysAgo).length || 0,
            categories: this.getCategoryBreakdown(marketplaceStats || [])
          },
          services: {
            requests: {
              total: serviceRequestStats?.length || 0,
              active: serviceRequestStats?.filter(s => s.status === 'active').length || 0,
              completed: serviceRequestStats?.filter(s => s.status === 'completed').length || 0,
              newThisWeek: serviceRequestStats?.filter(s => new Date(s.created_at) >= sevenDaysAgo).length || 0
            },
            offers: {
              total: serviceOfferStats?.length || 0,
              active: serviceOfferStats?.filter(s => s.status === 'active').length || 0,
              newThisWeek: serviceOfferStats?.filter(s => new Date(s.created_at) >= sevenDaysAgo).length || 0
            }
          },
          orders: {
            total: orderStats?.length || 0,
            pending: orderStats?.filter(o => o.status === 'pending').length || 0,
            completed: orderStats?.filter(o => ['delivered', 'completed'].includes(o.status)).length || 0,
            totalRevenue: orderStats?.reduce((sum, order) => sum + (parseFloat(order.total_amount) || 0), 0) || 0,
            newThisWeek: orderStats?.filter(o => new Date(o.created_at) >= sevenDaysAgo).length || 0
          }
        };

        return { data: stats, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },

    getCategoryBreakdown(items: any[]) {
      const categories: { [key: string]: number } = {};
      items.forEach(item => {
        categories[item.category] = (categories[item.category] || 0) + 1;
      });
      return Object.entries(categories).map(([name, count]) => ({ name, count }));
    }
  },

  // Content Moderation
  contentModeration: {
    async createFlag(flagData: any) {
      const { data, error } = await supabase
        .from('content_moderation')
        .insert(flagData)
        .select()
        .single();
      
      return { data, error };
    },

    async getPendingItems(limit = 50) {
      const { data, error } = await supabase
        .from('content_moderation')
        .select(`
          *,
          users!inner(name, email, user_type)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit);
      
      return { data, error };
    },

    async updateStatus(id: number, status: string, adminUserId: number, notes?: string) {
      const { data, error } = await supabase
        .from('content_moderation')
        .update({
          status,
          admin_user_id: adminUserId,
          admin_notes: notes,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    }
  },

  // Platform Settings
  settings: {
    async get(key: string) {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('setting_key', key)
        .single();
      
      return { data, error };
    },

    async set(key: string, value: any, adminUserId: number, description?: string) {
      const { data, error } = await supabase
        .from('platform_settings')
        .upsert({
          setting_key: key,
          setting_value: JSON.stringify(value),
          description,
          admin_user_id: adminUserId,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' })
        .select()
        .single();
      
      return { data, error };
    },

    async getAll(category?: string) {
      let query = supabase.from('platform_settings').select('*');
      
      if (category) {
        query = query.eq('category', category);
      }
      
      const { data, error } = await query.order('category').order('setting_key');
      
      return { data, error };
    }
  },

  // Featured Items Management
  featuredItems: {
    async setFeatured(itemId: number, featured: boolean, adminUserId: number) {
      const { data, error } = await supabase
        .from('marketplace_items')
        .update({
          featured,
          moderated_by: adminUserId,
          moderated_at: new Date().toISOString()
        })
        .eq('id', itemId)
        .select()
        .single();
      
      return { data, error };
    },

    async getFeatured() {
      const { data, error } = await supabase
        .from('marketplace_items')
        .select(`
          *,
          users!inner(name, email, user_type, location)
        `)
        .eq('featured', true)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getFeaturedCount() {
      const { count, error } = await supabase
        .from('marketplace_items')
        .select('*', { count: 'exact', head: true })
        .eq('featured', true)
        .eq('status', 'active');
      
      return { count, error };
    }
  }
};

export default adminDb;