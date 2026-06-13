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

      // Search is handled in the API route with token scoring; PostgREST `.or()`
      // breaks when the query contains commas or other filter delimiters.

      if (filters.limit && Number(filters.limit) > 0) {
        query = query.limit(Number(filters.limit))
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

      // If valid_until was updated, propagate the canonical valid_until to active linked service_requests
      try {
        if (projectData && projectData.valid_until) {
          const { data: needs, error: needsError } = await supabase
            .from('service_requests')
            .select('id, project_context')
            .eq('project_id', id)
            .not('status', 'in', '(completed,cancelled)');

          if (!needsError && Array.isArray(needs) && needs.length > 0) {
            const now = new Date().toISOString();
            for (const need of needs) {
              try {
                const existingCtx = need.project_context && typeof need.project_context === 'object'
                  ? need.project_context
                  : (typeof need.project_context === 'string' ? JSON.parse(need.project_context || '{}') : {});

                const nextCtx = {
                  ...existingCtx,
                  project: {
                    ...(existingCtx.project && typeof existingCtx.project === 'object' ? existingCtx.project : {}),
                    valid_until: projectData.valid_until
                  }
                };

                await supabase
                  .from('service_requests')
                  .update({ project_context: nextCtx, updated_at: now })
                  .eq('id', need.id);
              } catch (e) {
                console.warn('Failed to propagate valid_until to need', need.id, e);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Error while propagating valid_until to linked needs:', e);
      }

      return data;
    },

    async delete(id: string | number) {
      const { data: linkedRequests, error: linkedRequestsError } = await supabase
        .from('service_requests')
        .select('id')
        .eq('project_id', id);

      if (linkedRequestsError) throw linkedRequestsError;

      for (const request of linkedRequests || []) {
        await db.serviceRequests.delete(request.id);
      }

      const { error } = await supabase
        .from('service_request_projects')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
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
            .select('id, name, email, user_type, location, city, state_province, country, phone, pincode, ngo_volunteer_capacity, profile_image, profile_data, industry, verification_status')
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
      // If requestData includes project_id, try to inherit canonical project fields
      if (requestData.project_id) {
        try {
          const { data: projectRow } = await supabase
            .from('service_request_projects')
            .select('id, expected_beneficiaries, location, exact_address, timeline, description, title, valid_until')
            .eq('id', String(requestData.project_id))
            .single();

          if (projectRow) {
            requestData.beneficiary_count = requestData.beneficiary_count ?? projectRow.expected_beneficiaries ?? requestData.beneficiary_count;
            requestData.location = requestData.location || projectRow.exact_address || projectRow.location || requestData.location;
            requestData.impact_description = requestData.impact_description || projectRow.description || requestData.impact_description;
            requestData.timeline = requestData.timeline || projectRow.timeline || requestData.timeline;
            // Ensure project_context contains canonical project reference
            const existingCtx = requestData.project_context && typeof requestData.project_context === 'object' ? requestData.project_context : {};
            requestData.project_context = {
              ...existingCtx,
              project: {
                id: projectRow.id,
                title: projectRow.title || existingCtx.project?.title || null,
                exact_address: projectRow.exact_address || projectRow.location || existingCtx.project?.exact_address || null,
                valid_until: projectRow.valid_until || existingCtx.project?.valid_until || null
              }
            };
          }
        } catch (e) {
          console.warn('Failed to inherit project fields for service_requests.create:', e);
        }
      }

      const { data, error } = await supabase
        .from('service_requests')
        .insert(requestData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(id: string | number, requestData: any) {
      // If updating project_id, try to inherit project canonical fields when missing
      if (requestData.project_id) {
        try {
          const { data: projectRow } = await supabase
            .from('service_request_projects')
            .select('id, expected_beneficiaries, location, exact_address, timeline, description, title, valid_until')
            .eq('id', String(requestData.project_id))
            .single();

          if (projectRow) {
            if (requestData.beneficiary_count === undefined || requestData.beneficiary_count === null) {
              requestData.beneficiary_count = projectRow.expected_beneficiaries ?? requestData.beneficiary_count;
            }
            requestData.location = requestData.location || projectRow.exact_address || projectRow.location || requestData.location;
            requestData.impact_description = requestData.impact_description || projectRow.description || requestData.impact_description;
            requestData.timeline = requestData.timeline || projectRow.timeline || requestData.timeline;

            const existingCtx = requestData.project_context && typeof requestData.project_context === 'object' ? requestData.project_context : {};
            requestData.project_context = {
              ...existingCtx,
              project: {
                id: projectRow.id,
                title: projectRow.title || existingCtx.project?.title || null,
                exact_address: projectRow.exact_address || projectRow.location || existingCtx.project?.exact_address || null,
                valid_until: projectRow.valid_until || existingCtx.project?.valid_until || null
              }
            };
          }
        } catch (e) {
          console.warn('Failed to inherit project fields for service_requests.update:', e);
        }
      }

      // Enforce: service_requests cannot be set to 'expired' individually unless
      // their parent project's valid_until has passed. This central guard prevents
      // accidental single-need expiry outside the project expiry flow.
      if (String(requestData.status || '').toLowerCase() === 'expired') {
        try {
          // Fetch the request's project_id if not provided
          let projectId = requestData.project_id
          if (!projectId) {
            const { data: currentRow } = await supabase
              .from('service_requests')
              .select('id, project_id')
              .eq('id', id)
              .maybeSingle();

            projectId = currentRow?.project_id
          }

          if (!projectId) {
            throw new Error('Cannot expire a standalone need without a parent project')
          }

          const { data: projectRow } = await supabase
            .from('service_request_projects')
            .select('id, valid_until')
            .eq('id', String(projectId))
            .maybeSingle();

          const validUntil = projectRow?.valid_until ? new Date(String(projectRow.valid_until)).getTime() : null
          const now = Date.now()
          if (!validUntil || validUntil > now) {
            throw new Error('Project valid_until has not passed; cannot expire individual needs')
          }
        } catch (e) {
          console.warn('Blocked individual need expiry:', e)
          throw e
        }
      }

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
      // Prevent setting status to 'expired' for a single need unless project validity passed
      if (String(status || '').toLowerCase() === 'expired') {
        const { data: reqRow, error: reqErr } = await supabase
          .from('service_requests')
          .select('id, project_id')
          .eq('id', id)
          .maybeSingle();

        if (reqErr) throw reqErr

        const projectId = reqRow?.project_id
        if (!projectId) throw new Error('Cannot expire a standalone need without a parent project')

        const { data: projectRow, error: projErr } = await supabase
          .from('service_request_projects')
          .select('valid_until')
          .eq('id', String(projectId))
          .maybeSingle();

        if (projErr) throw projErr

        const validUntil = projectRow?.valid_until ? new Date(String(projectRow.valid_until)).getTime() : null
        const now = Date.now()
        if (!validUntil || validUntil > now) {
          throw new Error('Project valid_until has not passed; cannot expire individual needs')
        }
      }

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

      const includeExpired = Boolean(filters.includeExpired)
      const now = Date.now()
      const nonExpiredOffers = includeExpired
        ? (data || [])
        : (data || []).filter((offer: any) => {
            const expiryValue = offer.valid_until || offer.expires_at
            if (!expiryValue) return true
            const expiryMs = Date.parse(String(expiryValue))
            if (Number.isNaN(expiryMs)) return true
            return expiryMs >= now
          })
      
      // Fetch application counts for each service offer
      if (nonExpiredOffers && nonExpiredOffers.length > 0) {
        const offerIds = nonExpiredOffers.map((item: any) => item.id);
        
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
        return nonExpiredOffers.map((offer: any) => ({
          ...offer,
          ngo_id: offer.creator_id,
          applications_count: hireCounts[offer.id] || 0
        }));
      }
      
      return nonExpiredOffers.map((offer: any) => ({
        ...offer,
        ngo_id: offer.creator_id
      }));
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
      return data ? { ...data, ngo_id: data.creator_id } : data;
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