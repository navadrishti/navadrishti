// Updated Database connection utility - now using Supabase PostgreSQL
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// No-op function for compatibility with existing API routes
// Supabase handles schema management automatically
export async function initializeDatabase() {
  return true;
}

// Helper function to execute SQL queries (for raw SQL if needed)
export async function executeQuery({ query, values = [] }: { query: string; values?: any[] }) {
  try {
    // For raw SQL queries (when migrating from MySQL syntax)
    const { data, error } = await supabase.rpc('execute_sql', { 
      sql_query: query, 
      query_params: values 
    });
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Modern Supabase helpers (recommended approach)
export const db = {
  // Users
  users: {
    async findByEmail(email: string) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async create(userData: any) {
      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(id: number, userData: any) {
      const { data, error } = await supabase
        .from('users')
        .update(userData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async findById(id: number) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  },

  // Marketplace Items
  marketplaceItems: {
    async getAll(filters: any = {}) {
      let query = supabase.from('marketplace_items').select('*');
      
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async getById(id: string | number) {
      const { data, error } = await supabase
        .from('service_requests')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async create(itemData: any) {
      const { data, error } = await supabase
        .from('marketplace_items')
        .insert(itemData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(id: number, itemData: any) {
      const { data, error } = await supabase
        .from('marketplace_items')
        .update(itemData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async delete(id: number, sellerId?: number) {
      let query = supabase
        .from('marketplace_items')
        .delete()
        .eq('id', id);
      
      if (sellerId) {
        query = query.eq('seller_id', sellerId);
      }
      
      const { error } = await query;
      
      if (error) throw error;
      return true;
    }
  },

  // Service Requests
  serviceRequests: {
    async getAll(filters: any = {}) {
      let query = supabase.from('service_requests').select(`
        *,
        ngo:users!ngo_id(name, email, user_type)
      `);
      
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async getById(id: number) {
      const { data, error } = await supabase
        .from('service_requests')
        .select(`
          *,
          ngo:users!ngo_id(name, email, user_type, location)
        `)
        .eq('id', id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async create(requestData: any) {
      const { data, error } = await supabase
        .from('service_requests')
        .insert(requestData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(id: string | number, requestData: any) {
      const { data, error } = await supabase
        .from('service_requests')
        .update(requestData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async delete(id: string | number, ngoId?: number) {
      // First delete related volunteers
      await supabase
        .from('service_volunteers')
        .delete()
        .eq('service_request_id', id);

      // Then delete the service request
      let query = supabase
        .from('service_requests')
        .delete()
        .eq('id', id);
      
      if (ngoId) {
        query = query.eq('ngo_id', ngoId);
      }
      
      const { error } = await query;
      
      if (error) throw error;
      return true;
    }
  },

  // Service Offers
  serviceOffers: {
    async getAll(filters: any = {}) {
      let query = supabase.from('service_offers').select(`
        *,
        ngo:users!ngo_id(name, email, user_type)
      `);
      
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async getById(id: number) {
      const { data, error } = await supabase
        .from('service_offers')
        .select(`
          *,
          ngo:users!ngo_id(name, email, user_type, location)
        `)
        .eq('id', id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async create(offerData: any) {
      const { data, error } = await supabase
        .from('service_offers')
        .insert(offerData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(id: string | number, offerData: any) {
      const { data, error } = await supabase
        .from('service_offers')
        .update(offerData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async delete(id: string | number, ngoId?: number) {
      let query = supabase
        .from('service_offers')
        .delete()
        .eq('id', id);
      
      if (ngoId) {
        query = query.eq('ngo_id', ngoId);
      }
      
      const { error } = await query;
      
      if (error) throw error;
      return true;
    }
  },

  // Service Clients (for hiring)
  serviceClients: {
    async create(clientData: any) {
      const { data, error } = await supabase
        .from('service_clients')
        .insert(clientData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async getByOfferId(serviceOfferId: number) {
      const { data, error } = await supabase
        .from('service_clients')
        .select(`
          *,
          client:users!client_id(name, email, user_type)
        `)
        .eq('service_offer_id', serviceOfferId)
        .order('applied_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  },

  // Cart
  cart: {
    async getByUserId(userId: number) {
      const { data, error } = await supabase
        .from('cart')
        .select(`
          *,
          marketplace_item:marketplace_items(title, price, images, status)
        `)
        .eq('user_id', userId);
      
      if (error) throw error;
      return data;
    },

    async add(cartData: any) {
      const { data, error } = await supabase
        .from('cart')
        .upsert(cartData, { onConflict: 'user_id,marketplace_item_id' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async remove(userId: number, itemId: number) {
      const { error } = await supabase
        .from('cart')
        .delete()
        .eq('user_id', userId)
        .eq('marketplace_item_id', itemId);
      
      if (error) throw error;
      return true;
    }
  },

  // Purchases
  purchases: {
    async create(purchaseData: any) {
      const { data, error } = await supabase
        .from('marketplace_purchases')
        .insert(purchaseData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async getByUserId(userId: number) {
      const { data, error } = await supabase
        .from('marketplace_purchases')
        .select(`
          *,
          marketplace_item:marketplace_items(title, images),
          seller:users!seller_id(name, email)
        `)
        .eq('buyer_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async getById(id: number) {
      const { data, error } = await supabase
        .from('marketplace_purchases')
        .select(`
          *,
          marketplace_item:marketplace_items(title, images, price),
          seller:users!seller_id(name, email),
          buyer:users!buyer_id(name, email)
        `)
        .eq('id', id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async updateStatus(id: number, status: string) {
      const { data, error } = await supabase
        .from('marketplace_purchases')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  },

  // Service Volunteers (updated with combined methods)
  serviceVolunteers: {
    async create(applicationData: any) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .insert(applicationData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async getByRequestId(serviceRequestId: number) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .select(`
          *,
          volunteer:users!volunteer_id(name, email, user_type)
        `)
        .eq('service_request_id', serviceRequestId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async getByVolunteerId(volunteerId: number) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .select(`
          *,
          service_request:service_requests(title, category, status)
        `)
        .eq('volunteer_id', volunteerId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async findExisting(requestId: number, volunteerId: number) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .select('id')
        .eq('service_request_id', requestId)
        .eq('volunteer_id', volunteerId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async updateStatus(id: number, status: string) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  },

  // Wishlist
  wishlist: {
    async getByUserId(userId: number) {
      const { data, error } = await supabase
        .from('wishlist')
        .select(`
          *,
          marketplace_item:marketplace_items(
            id, title, price, compare_price, images, status, rating_average, rating_count,
            seller:users!seller_id(name)
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async add(userId: number, itemId: number) {
      const { data, error } = await supabase
        .from('wishlist')
        .upsert({ 
          user_id: userId, 
          marketplace_item_id: itemId,
          created_at: new Date().toISOString() 
        }, { onConflict: 'user_id,marketplace_item_id' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async remove(userId: number, itemId: number) {
      const { error } = await supabase
        .from('wishlist')
        .delete()
        .eq('user_id', userId)
        .eq('marketplace_item_id', itemId);
      
      if (error) throw error;
      return true;
    },

    async findExisting(userId: number, itemId: number) {
      const { data, error } = await supabase
        .from('wishlist')
        .select('id')
        .eq('user_id', userId)
        .eq('marketplace_item_id', itemId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  }
};

// Export the main database object for easy use
export default db;