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

// Helper function for backward compatibility - converts to direct Supabase queries
export async function executeQuery({ query, values = [] }: { query: string; values?: any[] }) {
  try {
    // Log the problematic query for debugging
    console.error('⚠️  DEPRECATED executeQuery called:', {
      query: query.substring(0, 100) + '...',
      values: values.length,
      stack: new Error().stack?.split('\n')[2]?.trim()
    });
    
    // Return empty array for SELECT queries, throw error for others
    if (query.trim().toUpperCase().startsWith('SELECT')) {
      console.warn('Returning empty result for SELECT query. This API needs migration to Supabase client.');
      return [];
    }
    
    // For non-SELECT queries, throw an error to prevent data corruption
    throw new Error('executeQuery function is deprecated. This API needs to be converted to use Supabase client directly.');
    
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
      if (filters.seller_id) {
        query = query.eq('seller_id', filters.seller_id);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async getAllWithSeller(filters: any = {}) {
      let query = supabase
        .from('marketplace_items')
        .select(`
          *,
          seller:users!seller_id(id, name, email, user_type, location)
        `)
        .eq('status', 'active');
      
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.seller_id) {
        query = query.eq('seller_id', filters.seller_id);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async getById(id: string | number) {
      const { data, error } = await supabase
        .from('marketplace_items')
        .select(`
          *,
          seller:users!seller_id(id, name, email, user_type, location)
        `)
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
      let query = supabase.from('service_requests').select('*');
      
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.requester_id) {
        query = query.eq('ngo_id', filters.requester_id);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch requester data separately and merge
      if (data && data.length > 0) {
        const requesterIds = [...new Set(data.map((item: any) => item.ngo_id))];
        const { data: users } = await supabase
          .from('users')
          .select('id, name, email, user_type')
          .in('id', requesterIds);
        
        // Merge requester data
        return data.map((request: any) => ({
          ...request,
          requester: users?.find((user: any) => user.id === request.ngo_id),
          // Add requester_id for backward compatibility
          requester_id: request.ngo_id
        }));
      }
      
      return data;
    },

    async getById(id: number) {
      const { data, error } = await supabase
        .from('service_requests')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      // Fetch requester data separately
      if (data && data.ngo_id) {
        const { data: requester } = await supabase
          .from('users')
          .select('id, name, email, user_type, location')
          .eq('id', data.ngo_id)
          .single();
        
        return {
          ...data,
          requester,
          // Add requester_id for backward compatibility
          requester_id: data.ngo_id
        };
      }
      
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

    async delete(id: string | number, requesterId?: number) {
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
      
      if (requesterId) {
        query = query.eq('ngo_id', requesterId);
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
      if (filters.ngo_id) {
        query = query.eq('ngo_id', filters.ngo_id);
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
          marketplace_item:marketplace_items(
            title, 
            price, 
            images, 
            status, 
            category,
            seller_id,
            seller:users!seller_id(id, name, email, user_type)
          )
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
    },

    async removeById(cartId: number, userId: number) {
      const { error } = await supabase
        .from('cart')
        .delete()
        .eq('id', cartId)
        .eq('user_id', userId); // Security check to ensure user owns this cart item
      
      if (error) throw error;
      return true;
    }
  },

  // Individual Verifications
  individualVerifications: {
    async findByUserId(userId: number) {
      const { data, error } = await supabase
        .from('individual_verifications')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async create(verificationData: any) {
      const { data, error } = await supabase
        .from('individual_verifications')
        .insert(verificationData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(userId: number, updateData: any) {
      const { data, error } = await supabase
        .from('individual_verifications')
        .update(updateData)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async upsert(verificationData: any) {
      const { data, error } = await supabase
        .from('individual_verifications')
        .upsert(verificationData, { onConflict: 'user_id' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
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
        .select('*')
        .eq('service_request_id', serviceRequestId)
        .order('applied_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch volunteer data separately and merge
      if (data && data.length > 0) {
        const volunteerIds = [...new Set(data.map(item => item.volunteer_id))];
        const { data: volunteers } = await supabase
          .from('users')
          .select('id, name, email, user_type')
          .in('id', volunteerIds);
        
        // Merge volunteer data with flat structure for frontend compatibility
        return data.map(application => {
          const volunteer = volunteers?.find(volunteer => volunteer.id === application.volunteer_id);
          return {
            ...application,
            // Flat fields expected by frontend
            volunteer_name: volunteer?.name || 'Unknown',
            volunteer_email: volunteer?.email || 'No email',
            volunteer_type: volunteer?.user_type || 'individual',
            // Also keep the nested structure for future use
            volunteer: volunteer,
            // Map application_message to message for frontend compatibility
            message: application.application_message
          };
        });
      }
      
      return data;
    },

    async getByVolunteerId(volunteerId: number) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .select('*')
        .eq('volunteer_id', volunteerId)
        .order('applied_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch service request data separately and merge
      if (data && data.length > 0) {
        const requestIds = [...new Set(data.map(item => item.service_request_id))];
        const { data: requests } = await supabase
          .from('service_requests')
          .select('id, title, category, status')
          .in('id', requestIds);
        
        // Merge service request data
        return data.map(application => ({
          ...application,
          service_request: requests?.find(request => request.id === application.service_request_id)
        }));
      }
      
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

    async getUserApplication(requestId: number, volunteerId: number) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .select('*')
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
  },

  // Orders (E-commerce functionality)
  orders: {
    async getAll(filters: any = {}) {
      let query = supabase
        .from('ecommerce_orders')
        .select(`
          *,
          buyer:users!buyer_id(id, name, email, user_type),
          seller:users!seller_id(id, name, email, user_type)
        `);
      
      if (filters.buyer_id) {
        query = query.eq('buyer_id', filters.buyer_id);
      }
      if (filters.seller_id) {
        query = query.eq('seller_id', filters.seller_id);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('ecommerce_orders')
        .select(`
          *,
          buyer:users!buyer_id(id, name, email, user_type),
          seller:users!seller_id(id, name, email, user_type)
        `)
        .eq('order_number', id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async create(orderData: any) {
      const { data, error } = await supabase
        .from('ecommerce_orders')
        .insert(orderData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(id: number, orderData: any) {
      const { data, error } = await supabase
        .from('ecommerce_orders')
        .update(orderData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  },

  // Order Items
  orderItems: {
    async getByOrderId(orderId: number) {
      const { data, error } = await supabase
        .from('ecommerce_order_items')
        .select(`
          *,
          marketplace_item:marketplace_items!marketplace_item_id(*)
        `)
        .eq('order_id', orderId);
      
      if (error) throw error;
      return data;
    },

    async create(itemData: any) {
      const { data, error } = await supabase
        .from('ecommerce_order_items')
        .insert(itemData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  },

  // Payments
  payments: {
    async getByOrderId(orderId: number) {
      const { data, error } = await supabase
        .from('ecommerce_payments')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async create(paymentData: any) {
      const { data, error } = await supabase
        .from('ecommerce_payments')
        .insert(paymentData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(id: number, paymentData: any) {
      const { data, error } = await supabase
        .from('ecommerce_payments')
        .update(paymentData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  },

  // Shipping Details
  shippingDetails: {
    async getByOrderId(orderId: number) {
      const { data, error } = await supabase
        .from('ecommerce_shipping_details')
        .select('*')
        .eq('order_id', orderId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async create(shippingData: any) {
      const { data, error } = await supabase
        .from('ecommerce_shipping_details')
        .insert(shippingData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(orderId: number, shippingData: any) {
      const { data, error } = await supabase
        .from('ecommerce_shipping_details')
        .update(shippingData)
        .eq('order_id', orderId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  },

  // User Addresses
  userAddresses: {
    async getByUserId(userId: number) {
      const { data, error } = await supabase
        .from('user_addresses')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async getById(id: number) {
      const { data, error } = await supabase
        .from('user_addresses')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async create(addressData: any) {
      // If this is being set as default, unset others first
      if (addressData.is_default) {
        await supabase
          .from('user_addresses')
          .update({ is_default: false })
          .eq('user_id', addressData.user_id);
      }

      const { data, error } = await supabase
        .from('user_addresses')
        .insert(addressData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(id: number, addressData: any) {
      // If this is being set as default, unset others first
      if (addressData.is_default) {
        const address = await this.getById(id);
        if (address) {
          await supabase
            .from('user_addresses')
            .update({ is_default: false })
            .eq('user_id', address.user_id)
            .neq('id', id);
        }
      }

      const { data, error } = await supabase
        .from('user_addresses')
        .update(addressData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async delete(id: number) {
      const { error } = await supabase
        .from('user_addresses')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return true;
    }
  }
};

// Export the main database object for easy use
export default db;