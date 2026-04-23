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

  // Service Requests
  requestProjects: {
    async getAll(filters: any = {}) {
      let query = supabase.from('service_request_projects').select('*');

      if (filters.ngo_id) {
        query = query.eq('ngo_id', filters.ngo_id);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('service_request_projects')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async create(projectData: any) {
      const { data, error } = await supabase
        .from('service_request_projects')
        .insert(projectData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async update(id: string, projectData: any) {
      const { data, error } = await supabase
        .from('service_request_projects')
        .update(projectData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

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
      if (filters.project_id) {
        query = query.eq('project_id', filters.project_id);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch requester data and volunteer counts separately
      if (data && data.length > 0) {
        const requesterIds = [...new Set(data.map((item: any) => item.ngo_id))];
        const projectIds = [...new Set(data.map((item: any) => item.project_id).filter(Boolean))];
        const requestIds = data.map((item: any) => item.id);
        
        const [usersResult, projectsResult, volunteersResult] = await Promise.all([
          supabase
            .from('users')
            .select('id, name, email, user_type, verification_status')
            .in('id', requesterIds),
          projectIds.length > 0
            ? supabase
                .from('service_request_projects')
                .select('*')
                .in('id', projectIds)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('service_volunteers')
            .select('service_request_id')
            .in('service_request_id', requestIds)
            .in('status', ['accepted', 'active', 'completed']) // Include completed volunteers in count
        ]);
        
        const users = usersResult.data || [];
        const projects = projectsResult.data || [];
        const volunteers = volunteersResult.data || [];
        
        // Count volunteers per request
        const volunteerCounts = volunteers.reduce((acc: any, vol: any) => {
          acc[vol.service_request_id] = (acc[vol.service_request_id] || 0) + 1;
          return acc;
        }, {});
        
        // Merge requester data and volunteer counts
        return data.map((request: any) => ({
          ...request,
          requester: users?.find((user: any) => user.id === request.ngo_id),
          project: projects?.find((project: any) => project.id === request.project_id) || null,
          volunteers_count: volunteerCounts[request.id] || 0,
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
        const [{ data: requester }, { data: project }] = await Promise.all([
          supabase
            .from('users')
            .select('id, name, email, user_type, location, city, state_province, country, phone, pincode, ngo_size, profile_image, profile_data, industry, verification_status')
            .eq('id', data.ngo_id)
            .single(),
          data.project_id
            ? supabase
                .from('service_request_projects')
                .select('*')
                .eq('id', data.project_id)
                .single()
            : Promise.resolve({ data: null })
        ]);
        
        return {
          ...data,
          requester,
          project: project || null,
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

    async updateStatus(id: number, status: string) {
      const { data, error } = await supabase
        .from('service_requests')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
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

  serviceRequestContributions: {
    async create(contributionData: any) {
      const { data, error } = await supabase
        .from('service_request_contributions')
        .insert(contributionData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async getByRequestId(serviceRequestId: number) {
      const { data, error } = await supabase
        .from('service_request_contributions')
        .select(`
          *,
          contributor:users!contributor_id(id, name, email, user_type, profile_image)
        `)
        .eq('service_request_id', serviceRequestId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    }
  },

  // Service Offers
  serviceOffers: {
    async getAll(filters: any = {}) {
      let query = supabase.from('service_offers').select(`
        *,
        ngo:users!creator_id(name, email, user_type, verification_status)
      `);
      
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.creator_id || filters.ngo_id) {
        query = query.eq('creator_id', filters.creator_id || filters.ngo_id);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch application counts for each service offer
      if (data && data.length > 0) {
        const offerIds = data.map((item: any) => item.id);
        
        const { data: hires } = await supabase
          .from('service_clients') // Correct table name
          .select('service_offer_id')
          .in('service_offer_id', offerIds)
          .eq('status', 'accepted'); // Only count accepted clients
        
        // Count applications per offer
        const hireCounts = (hires || []).reduce((acc: any, hire: any) => {
          acc[hire.service_offer_id] = (acc[hire.service_offer_id] || 0) + 1;
          return acc;
        }, {});
        
        // Add application counts to offers
        return data.map((offer: any) => ({
          ...offer,
          applications_count: hireCounts[offer.id] || 0
        }));
      }
      
      return data;
    },

    async getById(id: number) {
      const { data, error } = await supabase
        .from('service_offers')
        .select(`
          *,
          ngo:users!creator_id(name, email, user_type, location, verification_status, profile_image)
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
        query = query.eq('creator_id', ngoId);
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

  // Service Volunteers (updated with combined methods)
  serviceVolunteers: {
    async create(applicationData: any) {
      const payload = {
        ...applicationData,
        application_message: applicationData.application_message ?? applicationData.message ?? '',
        responder_type: applicationData.responder_type ?? applicationData.volunteer_type ?? null,
        updated_at: applicationData.updated_at ?? new Date().toISOString()
      };

      if ('message' in payload) {
        delete payload.message;
      }

      if ('volunteer_type' in payload) {
        delete payload.volunteer_type;
      }

      const { data, error } = await supabase
        .from('service_volunteers')
        .insert(payload)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async findExisting(serviceRequestId: number, volunteerId: number) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .select('*')
        .eq('service_request_id', serviceRequestId)
        .eq('volunteer_id', volunteerId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async getByVolunteerId(volunteerId: number) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .select('*')
        .eq('volunteer_id', volunteerId)
        .order('applied_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    async getByRequestId(serviceRequestId: number) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .select(`
          *,
          volunteer:users!volunteer_id(id, name, email, user_type, location, verification_status, profile_image)
        `)
        .eq('service_request_id', serviceRequestId)
        .order('applied_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    async getUserApplication(serviceRequestId: number, volunteerId: number) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .select('*')
        .eq('service_request_id', serviceRequestId)
        .eq('volunteer_id', volunteerId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async updateStatus(id: number, status: string) {
      const { data, error } = await supabase
        .from('service_volunteers')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // Support Tickets
  supportTickets: {
    async create(ticketData: any) {
      const { data, error } = await supabase
        .from('support_tickets')
        .insert(ticketData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async getAll(filters: { status?: string; search?: string } = {}) {
      let query = supabase
        .from('support_tickets')
        .select(`
          *,
          user:users!user_id(id, name, email, user_type, verification_status, profile_image)
        `)
        .order('created_at', { ascending: false });

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.search) {
        const search = filters.search.trim();
        if (search) {
          query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,ticket_id.ilike.%${search}%`);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async update(id: number | string, updateData: any) {
      const { data, error } = await supabase
        .from('support_tickets')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async getById(id: number | string) {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          user:users!user_id(id, name, email, user_type, verification_status, profile_image)
        `)
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  },

  supportTicketMessages: {
    async create(messageData: any) {
      const { data, error } = await supabase
        .from('support_ticket_messages')
        .insert(messageData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async getByTicketId(ticketId: string) {
      const { data, error } = await supabase
        .from('support_ticket_messages')
        .select(`
          *,
          sender:users!sender_id(id, name, email, user_type, profile_image)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
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