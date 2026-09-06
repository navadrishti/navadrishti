import 'server-only'
import { createClient } from '@supabase/supabase-js';
import { buildAllocationUpdatePayload } from '@/lib/service-request-allocation'
import {
  type AgentKind,
  type PublishedEntity,
  readPublishedEntity,
} from '@/lib/ai-agent-sessions'
import {
  CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND,
  filterVolunteerApplicationsExcludingLeadNgo,
  getElapsedCampaignDays,
  getInclusiveDayCount,
  isCampaignVolunteerAssignment,
  safeJson,
  type CampaignVolunteerAttendanceSummary,
  type VolunteerAttendanceRosterRow,
} from '@/lib/campaign-volunteer-attendance'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!;

export const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/** Server-side Supabase client (same instance as `supabase`). */
export function createServerClient() {
  return supabase
}

export type VerificationActorType = 'individual' | 'ngo' | 'company'

export type VerificationDocumentRow = {
  id?: string
  user_id: number
  actor_type: VerificationActorType
  doc_key: string
  file_url?: string | null
  doc_number?: string | null
  valid_until?: string | null
  status?: string | null
  uploaded_at?: string | null
  reviewed_at?: string | null
  reviewed_by_platform_ca_id?: number | null
  metadata?: Record<string, unknown> | null
}

/** Map verification_documents rows into legacy profile_data.document_expiries shape. */
export function documentExpiriesFromRows(
  rows: VerificationDocumentRow[]
): Record<string, { number?: string | null; valid_until?: string | null; label?: string }> {
  const out: Record<string, { number?: string | null; valid_until?: string | null; label?: string }> = {}
  for (const row of rows) {
    if (!row.doc_key) continue
    out[row.doc_key] = {
      number: row.doc_number || null,
      valid_until: row.valid_until || null,
      label: row.doc_key,
    }
  }
  return out
}

/** Applicant on service_request_applications. */
export function getApplicationApplicantUserId(row: Record<string, unknown> | null | undefined): number {
  if (!row) return 0
  return Number(row.applicant_user_id ?? 0) || 0
}

/** Package lead on service_request_projects. */
export function getProjectLeadNgoId(project: Record<string, unknown> | null | undefined): number {
  if (!project) return 0
  return Number(project.lead_ngo_user_id ?? 0) || 0
}

export function buildProjectLeadNgoPatch(leadNgoUserId: number | null | undefined): {
  lead_ngo_user_id: number | null
} {
  const id = Number(leadNgoUserId || 0)
  return { lead_ngo_user_id: id > 0 ? id : null }
}

/** Normalize application insert/update payloads to applicant_user_id. */
export function normalizeApplicationApplicantFields<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload } as Record<string, unknown>
  const applicantId = Number(next.applicant_user_id ?? next.volunteer_id ?? 0)
  if (applicantId > 0) next.applicant_user_id = applicantId
  delete next.volunteer_id
  return next as T
}

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

      const shouldPropagate =
        projectData &&
        (
          projectData.valid_until !== undefined ||
          projectData.csr_project_available_for_csr !== undefined ||
          projectData.exact_address !== undefined ||
          projectData.location !== undefined ||
          projectData.expected_beneficiaries !== undefined
        );

      if (shouldPropagate) {
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

              const nextCtx: Record<string, any> = {
                ...existingCtx,
                project: {
                  ...(existingCtx.project && typeof existingCtx.project === 'object' ? existingCtx.project : {}),
                },
              };

              if (projectData.valid_until !== undefined) {
                nextCtx.project_valid_until = projectData.valid_until;
                nextCtx.project.valid_until = projectData.valid_until;
              }
              if (projectData.csr_project_available_for_csr !== undefined) {
                nextCtx.csr_project_available_for_csr = projectData.csr_project_available_for_csr;
                nextCtx.project.csr_project_available_for_csr = projectData.csr_project_available_for_csr;
              }
              if (projectData.exact_address !== undefined) {
                nextCtx.project_location = projectData.exact_address;
                nextCtx.project.exact_address = projectData.exact_address;
              }
              if (projectData.expected_beneficiaries !== undefined) {
                nextCtx.project_expected_beneficiaries = projectData.expected_beneficiaries;
                nextCtx.project.expected_beneficiaries = projectData.expected_beneficiaries;
              }

              await supabase
                .from('service_requests')
                .update({ project_context: nextCtx, updated_at: now })
                .eq('id', need.id);
            } catch (e) {
              console.warn('Failed to propagate project fields to need', need.id, e);
            }
          }
        }
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
      if (filters.ngo_id || filters.requester_id) {
        query = query.eq('ngo_id', filters.ngo_id || filters.requester_id);
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
            .from('service_request_applications')
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
          // Compatibility alias (prefer ngo_id in new code)
          ngo_id: request.ngo_id,
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
        .from('service_request_applications')
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

  // First-class KYC files (verification_documents)
  verificationDocuments: {
    async upsert(row: VerificationDocumentRow): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
      try {
        const payload = {
          user_id: row.user_id,
          actor_type: row.actor_type,
          doc_key: row.doc_key,
          file_url: row.file_url ?? null,
          doc_number: row.doc_number ?? null,
          valid_until: row.valid_until ?? null,
          status: row.status || 'uploaded',
          uploaded_at: row.uploaded_at || new Date().toISOString(),
          reviewed_at: row.reviewed_at ?? null,
          reviewed_by_platform_ca_id: row.reviewed_by_platform_ca_id ?? null,
          metadata: row.metadata || {},
          updated_at: new Date().toISOString(),
        }

        const { error } = await supabase.from('verification_documents').upsert(payload, {
          onConflict: 'user_id,actor_type,doc_key',
        })

        if (error) {
          if (/verification_documents|does not exist|schema cache/i.test(String(error.message || ''))) {
            return { ok: false, skipped: true, error: error.message }
          }
          return { ok: false, error: error.message }
        }
        return { ok: true }
      } catch (error: any) {
        return { ok: false, skipped: true, error: String(error?.message || error) }
      }
    },

    async listByUserId(userId: number): Promise<VerificationDocumentRow[]> {
      try {
        const { data, error } = await supabase
          .from('verification_documents')
          .select('*')
          .eq('user_id', userId)

        if (error || !Array.isArray(data)) return []
        return data as VerificationDocumentRow[]
      } catch {
        return []
      }
    },

    /** Sync uploaded document URLs into verification_documents (profile_data remains a mirror). */
    async syncActorDocuments(options: {
      userId: number
      actorType: VerificationActorType
      documents?: Record<string, string | null | undefined> | null
      numbers?: Record<string, string | null | undefined> | null
      expiries?: Record<string, string | null | undefined> | null
      status?: string
    }): Promise<void> {
      const docs = options.documents || {}
      for (const [docKey, fileUrl] of Object.entries(docs)) {
        const url = String(fileUrl || '').trim()
        if (!docKey || !url) continue
        await db.verificationDocuments.upsert({
          user_id: options.userId,
          actor_type: options.actorType,
          doc_key: docKey,
          file_url: url,
          doc_number: options.numbers?.[docKey] ? String(options.numbers[docKey]) : null,
          valid_until: options.expiries?.[docKey] ? String(options.expiries[docKey]) : null,
          status: options.status || 'uploaded',
        })
      }
    },
  },

  // Service request applications (formerly service_volunteers)
  serviceRequestApplications: {
    async create(applicationData: any) {
      const payload = normalizeApplicationApplicantFields({
        ...applicationData,
        application_message: applicationData.application_message ?? applicationData.message ?? '',
        responder_type: applicationData.responder_type ?? applicationData.volunteer_type ?? null,
        updated_at: applicationData.updated_at ?? new Date().toISOString()
      });

      if ('message' in payload) {
        delete payload.message;
      }

      if ('volunteer_type' in payload) {
        delete payload.volunteer_type;
      }

      // Fulfillment columns live on service_request_fulfillments (not applications)
      const fulfillmentFields = {
        fulfillment_amount: payload.fulfillment_amount ?? null,
        fulfillment_quantity: payload.fulfillment_quantity ?? null,
        impact_statement: payload.impact_statement ?? null,
        estimated_impact_value: payload.estimated_impact_value ?? null,
        assigned_amount: payload.assigned_amount ?? null,
        assigned_quantity: payload.assigned_quantity ?? null,
        fulfilled_amount: payload.fulfilled_amount ?? 0,
        fulfilled_quantity: payload.fulfilled_quantity ?? 0,
        individual_receipt_url: payload.individual_receipt_url ?? null,
        ngo_receipt_url: payload.ngo_receipt_url ?? null,
        individual_done_at: payload.individual_done_at ?? null,
        ngo_confirmed_at: payload.ngo_confirmed_at ?? null,
        completion_note: payload.completion_note ?? null,
        completed_at: payload.completed_at ?? null,
      }
      for (const key of Object.keys(fulfillmentFields)) {
        delete payload[key]
      }

      const { data, error } = await supabase
        .from('service_request_applications')
        .insert(payload)
        .select()
        .single();
      
      if (error) throw error;

      // Ensure paired fulfillment row exists (schema split)
      try {
        await supabase.from('service_request_fulfillments').upsert(
          {
            application_id: data.id,
            service_request_id: data.service_request_id,
            ...fulfillmentFields,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'application_id' }
        );
      } catch {
        // Table may not exist until migration applied
      }

      return data;
    },

    async findExisting(serviceRequestId: number, applicantUserId: number) {
      const { data, error } = await supabase
        .from('service_request_applications')
        .select('*')
        .eq('service_request_id', serviceRequestId)
        .eq('applicant_user_id', applicantUserId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async getByVolunteerId(applicantUserId: number) {
      const { data, error } = await supabase
        .from('service_request_applications')
        .select('*')
        .eq('applicant_user_id', applicantUserId)
        .order('applied_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    async getByRequestId(serviceRequestId: number) {
      const { data, error } = await supabase
        .from('service_request_applications')
        .select(`
          *,
          volunteer:users!applicant_user_id(id, name, email, user_type, location, verification_status, profile_image)
        `)
        .eq('service_request_id', serviceRequestId)
        .order('applied_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    async getUserApplication(serviceRequestId: number, applicantUserId: number) {
      const { data, error } = await supabase
        .from('service_request_applications')
        .select('*')
        .eq('service_request_id', serviceRequestId)
        .eq('applicant_user_id', applicantUserId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async updateStatus(id: number, status: string) {
      const { data, error } = await supabase
        .from('service_request_applications')
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

    async getByTicketId(ticketId: string) {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          user:users!user_id(id, name, email, user_type, verification_status, profile_image)
        `)
        .eq('ticket_id', ticketId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },

    async getById(id: number | string) {
      if (typeof id === 'string' && id.startsWith('SUP-')) {
        return this.getByTicketId(id);
      }

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
    },

    async getByUserId(userId: number, filters: { status?: string } = {}) {
      let query = supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (filters.status === 'open') {
        query = query.in('status', ['open', 'in_progress']);
      } else if (filters.status === 'closed') {
        query = query.in('status', ['resolved', 'closed']);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
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
      // No FK from sender_id → users in schema; do not embed users!sender_id.
      const { data, error } = await supabase
        .from('support_ticket_messages')
        .select('*')
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

/** @deprecated Prefer db.serviceRequestApplications */
;(db as any).serviceVolunteers = db.serviceRequestApplications

// Export the main database object for easy use
export default db;

export async function applyVolunteerAcceptanceAllocation(
  request: Record<string, any>,
  input: { amount?: number; quantity?: number }
) {
  const allocation = buildAllocationUpdatePayload(request, input)
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (allocation.current_amount != null) {
    updatePayload.current_amount = allocation.current_amount
    updatePayload.remaining_amount = allocation.remaining_amount
  }

  if (allocation.current_quantity != null) {
    updatePayload.current_quantity = allocation.current_quantity
    updatePayload.remaining_quantity = allocation.remaining_quantity
  }

  const { data, error } = await supabase
    .from('service_requests')
    .update(updatePayload)
    .eq('id', request.id)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update need allocation')
  }

  return data
}

const aiAgentTables = (agent: AgentKind) => ({
  sessions: agent === 'csr' ? 'csr_ai_agent_sessions' : 'ngo_ai_agent_sessions',
  state: agent === 'csr' ? 'csr_ai_agent_session_state' : 'ngo_ai_agent_session_state',
  messages: agent === 'csr' ? 'csr_ai_agent_messages' : 'ngo_ai_agent_messages',
})

async function deleteAiAgentSessionChildren(agent: AgentKind, sessionId: string) {
  const { state, messages } = aiAgentTables(agent)
  await supabase.from(messages).delete().eq('session_id', sessionId)
  await supabase.from(state).delete().eq('session_id', sessionId)
}

export async function archiveAgentSession(
  agent: AgentKind,
  sessionId: string,
  published: PublishedEntity,
  existingContext: Record<string, unknown> = {},
) {
  const { sessions } = aiAgentTables(agent)
  const now = new Date().toISOString()
  const archivedContext: Record<string, unknown> = {
    ...existingContext,
    ai_agent_archived_at: now,
    ai_agent_published_at:
      typeof existingContext.ai_agent_published_at === 'string'
        ? existingContext.ai_agent_published_at
        : now,
  }

  if (published.type === 'campaign') {
    archivedContext.published_campaign_id = published.id
  } else {
    archivedContext.published_project_id = published.id
  }

  await deleteAiAgentSessionChildren(agent, sessionId)

  const { error } = await supabase
    .from(sessions)
    .update({
      status: 'archived',
      title: published.type === 'campaign' ? 'Published campaign' : 'Published project',
      project_context: archivedContext,
      last_message_at: null,
      updated_at: now,
    })
    .eq('id', sessionId)

  if (error) throw error
}

export async function hardDeleteAgentSession(agent: AgentKind, sessionId: string) {
  const { sessions } = aiAgentTables(agent)
  await deleteAiAgentSessionChildren(agent, sessionId)
  const { error } = await supabase.from(sessions).delete().eq('id', sessionId)
  if (error) throw error
}

export async function deleteAgentSessionForUser(
  agent: AgentKind,
  userId: number,
  sessionId: string,
): Promise<'archived' | 'deleted'> {
  const { sessions } = aiAgentTables(agent)

  const { data: row, error } = await supabase
    .from(sessions)
    .select('id, project_context, status')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!row) {
    throw new Error('Session not found')
  }

  const projectContext =
    row.project_context && typeof row.project_context === 'object'
      ? (row.project_context as Record<string, unknown>)
      : {}

  const published = readPublishedEntity(projectContext)

  if (published) {
    await archiveAgentSession(agent, sessionId, published, projectContext)
    return 'archived'
  }

  await hardDeleteAgentSession(agent, sessionId)
  return 'deleted'
}

/** Remove server sessions missing from a client sync payload (archive if published). */
export async function pruneRemovedAgentSessions(
  agent: AgentKind,
  userId: number,
  incomingSessionIds: string[],
) {
  const { sessions } = aiAgentTables(agent)
  const incoming = new Set(incomingSessionIds)

  const { data: existingRows, error } = await supabase
    .from(sessions)
    .select('id, project_context, status')
    .eq('user_id', userId)

  if (error) throw error

  for (const row of existingRows || []) {
    if (incoming.has(String(row.id))) continue
    if (String(row.status || '').toLowerCase() === 'archived') continue

    const projectContext =
      row.project_context && typeof row.project_context === 'object'
        ? (row.project_context as Record<string, unknown>)
        : {}
    const published = readPublishedEntity(projectContext)

    if (published) {
      await archiveAgentSession(agent, String(row.id), published, projectContext)
    } else {
      await hardDeleteAgentSession(agent, String(row.id))
    }
  }
}

export async function findCampaignVolunteerAssignment(campaignId: string, userId: number) {
  const { data: rows } = await supabase
    .from('service_engagement_assignments')
    .select('id, meta, target_type, target_id')
    .eq('target_id', campaignId)
    .eq('assignee_user_id', userId)

  return (rows || []).find((row) => isCampaignVolunteerAssignment(row)) || null
}

export async function ensureCampaignVolunteerAssignment(input: {
  campaign: {
    id: string | number
    title?: string | null
    company_id?: number | null
  }
  userId: number
  userType: string
  capacity: number
  appliedAt?: string
}) {
  const campaignId = String(input.campaign.id)
  const existing = await findCampaignVolunteerAssignment(campaignId, input.userId)

  if (existing?.id) {
    return existing
  }

  const ownerUserId = Number(input.campaign.company_id || 0) || input.userId

  const { data, error } = await supabase
    .from('service_engagement_assignments')
    .insert({
      target_type: 'csr_project',
      target_id: campaignId,
      owner_user_id: ownerUserId,
      assignee_user_id: input.userId,
      assigned_by_user_id: input.userId,
      status: 'active',
      billing_cycle: 'daily',
      payment_mode: 'postpaid',
      meta: {
        engagement_kind: CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND,
        campaign_id: campaignId,
        campaign_title: input.campaign.title || 'CSR Campaign',
        volunteer_capacity: input.capacity,
        volunteer_user_type: input.userType,
        volunteer_applied_at: input.appliedAt || new Date().toISOString(),
        attendance_mode: 'location',
      },
    })
    .select('id, meta')
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to create campaign volunteer assignment')
  }

  return data
}

export async function buildCampaignVolunteerAttendanceSummary(
  campaignId: string
): Promise<CampaignVolunteerAttendanceSummary | null> {
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('id, title, company_id, status, start_date, end_date, impact_metrics')
    .eq('id', campaignId)
    .maybeSingle()

  if (error || !campaign) return null

  const applications = filterVolunteerApplicationsExcludingLeadNgo(campaign.impact_metrics)
  const projectDays = getInclusiveDayCount(campaign.start_date, campaign.end_date)
  const elapsedDays = getElapsedCampaignDays(campaign.start_date, campaign.end_date)

  const { data: assignmentRows } = await supabase
    .from('service_engagement_assignments')
    .select('id, assignee_user_id, target_type, target_id, meta, status')
    .eq('target_id', campaignId)

  const assignments = (assignmentRows || []).filter((row) => isCampaignVolunteerAssignment(row))
  const assignmentByUser = new Map<number, any>()
  for (const row of assignments) {
    assignmentByUser.set(Number(row.assignee_user_id), row)
  }

  const assignmentIds = assignments.map((row) => row.id).filter(Boolean)
  const { data: entries } =
    assignmentIds.length > 0
      ? await supabase
          .from('service_attendance_entries')
          .select(
            'id, assignment_id, attendance_date, attendance_status, units, marked_for_user_id, meta'
          )
          .in('assignment_id', assignmentIds)
      : { data: [] as any[] }

  const entriesByAssignment = new Map<string, any[]>()
  for (const entry of entries || []) {
    const key = String(entry.assignment_id)
    const list = entriesByAssignment.get(key) || []
    list.push(entry)
    entriesByAssignment.set(key, list)
  }

  const roster: VolunteerAttendanceRosterRow[] = applications.map((app: any) => {
    const userId = Number(app?.user_id || 0)
    const capacity = Math.max(1, Number(app?.capacity || 1) || 1)
    const assignment = assignmentByUser.get(userId) || null
    const list = assignment ? entriesByAssignment.get(String(assignment.id)) || [] : []
    const presentEntries = list.filter(
      (entry) => String(entry.attendance_status || '').toLowerCase() === 'present'
    )
    const presentDates = new Set(
      presentEntries.map((entry) => String(entry.attendance_date || '').slice(0, 10)).filter(Boolean)
    )
    const daysPresent = presentDates.size
    const daysAbsent = Math.max(0, elapsedDays - daysPresent)
    const personDays = presentEntries.reduce(
      (sum, entry) => sum + (Number(entry.units) > 0 ? Number(entry.units) : capacity),
      0
    )
    const photoSealedDays = presentEntries.filter((entry) => {
      const meta = safeJson(entry.meta)
      return Array.isArray(meta.photos) && meta.photos.length > 0
    }).length
    const last = presentEntries
      .map((entry) => String(entry.attendance_date || ''))
      .sort()
      .at(-1) || null

    return {
      user_id: userId,
      name: String(app?.name || `User ${userId}`),
      user_type: String(app?.user_type || 'individual'),
      capacity,
      assignment_id: assignment?.id || null,
      days_present: daysPresent,
      days_absent: daysAbsent,
      project_days: projectDays,
      elapsed_days: elapsedDays,
      person_days_checked_in: personDays,
      attendance_rate: projectDays > 0 ? daysPresent / projectDays : 0,
      last_attendance_at: last,
      photo_sealed_days: photoSealedDays,
    }
  })

  const volunteersCheckedIn = roster.filter((row) => row.days_present > 0).length
  const totalPersonDays = roster.reduce((sum, row) => sum + row.person_days_checked_in, 0)
  const totalCapacity = roster.reduce((sum, row) => sum + row.capacity, 0)

  return {
    campaign_id: String(campaign.id),
    campaign_title: campaign.title || 'CSR Campaign',
    company_id: campaign.company_id != null ? Number(campaign.company_id) : null,
    status: String(campaign.status || ''),
    start_date: campaign.start_date || null,
    end_date: campaign.end_date || null,
    project_days: projectDays,
    elapsed_days: elapsedDays,
    volunteer_count: roster.length,
    volunteers_checked_in: volunteersCheckedIn,
    volunteers_never_checked_in: Math.max(0, roster.length - volunteersCheckedIn),
    total_person_days_checked_in: totalPersonDays,
    total_capacity: totalCapacity,
    roster,
  }
}

export async function listCompanyCampaignVolunteerAttendance(companyId: number) {
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, title, status, start_date, end_date, company_id')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(40)

  const summaries: CampaignVolunteerAttendanceSummary[] = []
  for (const campaign of campaigns || []) {
    const summary = await buildCampaignVolunteerAttendanceSummary(String(campaign.id))
    if (summary && summary.volunteer_count > 0) summaries.push(summary)
  }
  return summaries
}

export async function processCompletedCampaignVolunteerOutcomes(
  campaignId: string,
  options?: { treatAsCompleted?: boolean }
) {
  const summary = await buildCampaignVolunteerAttendanceSummary(campaignId)
  if (!summary) {
    return { banned: 0, historyWritten: 0 }
  }

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, title, company_id, status, start_date, end_date')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign) return { banned: 0, historyWritten: 0 }

  const isCompleted =
    options?.treatAsCompleted === true ||
    ['completed', 'finished'].includes(String(campaign.status || '').toLowerCase())

  if (!isCompleted) {
    return { banned: 0, historyWritten: 0, summary }
  }

  let banned = 0
  let historyWritten = 0
  const nowIso = new Date().toISOString()
  const projectDays = summary.project_days

  for (const row of summary.roster) {
    if (!row.user_id) continue

    const { data: userRow } = await supabase
      .from('users')
      .select('id, profile_data, name')
      .eq('id', row.user_id)
      .maybeSingle()

    if (!userRow) continue
    const profile = safeJson(userRow.profile_data)

    if (projectDays > 0 && row.days_present / projectDays < 0.25) {
      const ratePct = Math.round((row.days_present / projectDays) * 1000) / 10
      const nextProfile = {
        ...profile,
        volunteering_ban: {
          banned: true,
          active: true,
          reason: `Attendance below 25% (${row.days_present}/${projectDays} days, ${ratePct}%) on completed CSR campaign "${summary.campaign_title}".`,
          campaign_id: summary.campaign_id,
          campaign_title: summary.campaign_title,
          days_present: row.days_present,
          project_days: projectDays,
          attendance_rate: ratePct,
          banned_at: nowIso,
        },
      }
      await supabase
        .from('users')
        .update({ profile_data: nextProfile, updated_at: nowIso })
        .eq('id', row.user_id)
      banned += 1
      continue
    }

    if (projectDays > 0 && row.days_present / projectDays > 0.75) {
      const history = Array.isArray(profile.volunteering_history)
        ? [...profile.volunteering_history]
        : []
      const already = history.some(
        (entry: any) => String(entry?.campaign_id || '') === summary.campaign_id
      )
      if (!already) {
        history.push({
          campaign_id: summary.campaign_id,
          campaign_title: summary.campaign_title,
          company_id: summary.company_id,
          days_present: row.days_present,
          project_days: projectDays,
          capacity: row.capacity,
          person_days_checked_in: row.person_days_checked_in,
          attendance_rate: Math.round((row.days_present / projectDays) * 1000) / 10,
          completed_at: nowIso,
          start_date: summary.start_date,
          end_date: summary.end_date,
        })
        await supabase
          .from('users')
          .update({
            profile_data: { ...profile, volunteering_history: history },
            updated_at: nowIso,
          })
          .eq('id', row.user_id)
        historyWritten += 1
      }
    }
  }

  return { banned, historyWritten, summary }
}