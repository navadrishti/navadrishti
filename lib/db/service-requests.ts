import 'server-only'
import { buildAllocationUpdatePayload } from '@/lib/service-request-allocation'
import { parseJsonObject } from '@/lib/utils'
import type { Json, Tables, TablesInsert, TablesUpdate } from '@/lib/database.types'
import { supabase } from './client'

async function fetchParentProject(projectId: string) {
  const { data } = await supabase
    .from('service_request_projects')
    .select('id, expected_beneficiaries, location, exact_address, timeline, description, title, valid_until')
    .eq('id', projectId)
    .single();
  return data
}

type ParentProject = NonNullable<Awaited<ReturnType<typeof fetchParentProject>>>

function withProjectSnapshot(projectContext: Json | undefined, projectRow: ParentProject) {
  const existingCtx = parseJsonObject(projectContext);
  return {
    ...existingCtx,
    project: {
      id: projectRow.id,
      title: projectRow.title || existingCtx.project?.title || null,
      exact_address: projectRow.exact_address || projectRow.location || existingCtx.project?.exact_address || null,
      valid_until: projectRow.valid_until || existingCtx.project?.valid_until || null
    }
  };
}

export const serviceRequests = {
  async getAll(filters: { category?: string; status?: string; ngo_id?: number; project_id?: string } = {}) {
    let query = supabase.from('service_requests').select('*');

    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.ngo_id) {
      query = query.eq('ngo_id', filters.ngo_id);
    }
    if (filters.project_id) {
      query = query.eq('project_id', filters.project_id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      const requesterIds = [...new Set(data.map((item) => item.ngo_id))];
      const projectIds = [...new Set(data.map((item) => item.project_id).filter((id): id is string => Boolean(id)))];
      const requestIds = data.map((item) => item.id);

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
          .in('status', ['accepted', 'active', 'completed'])
      ]);

      const users = usersResult.data || [];
      const projects = projectsResult.data || [];
      const volunteers = volunteersResult.data || [];

      const volunteerCounts = volunteers.reduce<Record<string, number>>((acc, vol) => {
        acc[vol.service_request_id] = (acc[vol.service_request_id] || 0) + 1;
        return acc;
      }, {});

      return data.map((request) => ({
        ...request,
        requester: users?.find((user) => user.id === request.ngo_id),
        project: projects?.find((project) => project.id === request.project_id) || null,
        volunteers_count: volunteerCounts[request.id] || 0,
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
    if (!data) return null;

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
    };
  },

  async create(requestData: TablesInsert<'service_requests'>) {
    if (requestData.project_id) {
      try {
        const projectRow = await fetchParentProject(String(requestData.project_id));

        if (projectRow) {
          requestData.beneficiary_count = requestData.beneficiary_count ?? projectRow.expected_beneficiaries ?? requestData.beneficiary_count;
          requestData.location = requestData.location || projectRow.exact_address || projectRow.location || requestData.location;
          requestData.impact_description = requestData.impact_description || projectRow.description || requestData.impact_description;
          requestData.timeline = requestData.timeline || projectRow.timeline || requestData.timeline;
          requestData.project_context = withProjectSnapshot(requestData.project_context, projectRow);
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

  async update(id: string | number, requestData: TablesUpdate<'service_requests'>) {
    if (requestData.project_id) {
      try {
        const projectRow = await fetchParentProject(String(requestData.project_id));

        if (projectRow) {
          if (requestData.beneficiary_count === undefined || requestData.beneficiary_count === null) {
            requestData.beneficiary_count = projectRow.expected_beneficiaries ?? requestData.beneficiary_count;
          }
          requestData.location = requestData.location || projectRow.exact_address || projectRow.location || requestData.location;
          requestData.impact_description = requestData.impact_description || projectRow.description || requestData.impact_description;
          requestData.timeline = requestData.timeline || projectRow.timeline || requestData.timeline;
          requestData.project_context = withProjectSnapshot(requestData.project_context, projectRow);
        }
      } catch (e) {
        console.warn('Failed to inherit project fields for service_requests.update:', e);
      }
    }

    // A single need may only expire once its parent project's valid_until has passed;
    // expiry is otherwise driven by the project expiry flow.
    if (String(requestData.status || '').toLowerCase() === 'expired') {
      try {
        let projectId = requestData.project_id
        if (!projectId) {
          const { data: currentRow } = await supabase
            .from('service_requests')
            .select('id, project_id')
            .eq('id', Number(id))
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
      .eq('id', Number(id))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateStatus(id: number, status: string) {
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
    await supabase
      .from('service_request_applications')
      .delete()
      .eq('service_request_id', Number(id));

    let query = supabase
      .from('service_requests')
      .delete()
      .eq('id', Number(id));

    if (requesterId) {
      query = query.eq('ngo_id', requesterId);
    }

    const { error } = await query;

    if (error) throw error;
    return true;
  }
}

export const serviceRequestContributions = {
  async create(contributionData: TablesInsert<'service_request_contributions'>) {
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
}

export async function applyVolunteerAcceptanceAllocation(
  request: Tables<'service_requests'>,
  input: { amount?: number; quantity?: number }
) {
  const allocation = buildAllocationUpdatePayload(request, input)
  const updatePayload: TablesUpdate<'service_requests'> = {
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
