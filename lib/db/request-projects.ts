import 'server-only'
import { parseJsonObject } from '@/lib/utils'
import type { Json, TablesInsert, TablesUpdate } from '@/lib/database.types'
import { supabase } from './client'
import { serviceRequests } from './service-requests'

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

export const requestProjects = {
  async getAll(filters: { ngo_id?: number; status?: string; q?: string; limit?: number } = {}) {
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
      .maybeSingle();

    // 22P02: the id is not a valid uuid, which can only mean the project does not exist.
    if (error && error.code !== '22P02') throw error;
    return data;
  },

  async create(projectData: TablesInsert<'service_request_projects'>) {
    const { data, error } = await supabase
      .from('service_request_projects')
      .insert(projectData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /** Also mirrors project-level fields into the project_context of the project's open needs. */
  async update(id: string, projectData: TablesUpdate<'service_request_projects'>) {
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

            const nextProject = { ...parseJsonObject(existingCtx.project) };
            const nextCtx: { [key: string]: Json | undefined } = {
              ...existingCtx,
              project: nextProject,
            };

            if (projectData.valid_until !== undefined) {
              nextCtx.project_valid_until = projectData.valid_until;
              nextProject.valid_until = projectData.valid_until;
            }
            if (projectData.csr_project_available_for_csr !== undefined) {
              nextCtx.csr_project_available_for_csr = projectData.csr_project_available_for_csr;
              nextProject.csr_project_available_for_csr = projectData.csr_project_available_for_csr;
            }
            if (projectData.exact_address !== undefined) {
              nextCtx.project_location = projectData.exact_address;
              nextProject.exact_address = projectData.exact_address;
            }
            if (projectData.expected_beneficiaries !== undefined) {
              nextCtx.project_expected_beneficiaries = projectData.expected_beneficiaries;
              nextProject.expected_beneficiaries = projectData.expected_beneficiaries;
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
      .eq('project_id', String(id));

    if (linkedRequestsError) throw linkedRequestsError;

    for (const request of linkedRequests || []) {
      await serviceRequests.assertDeletable(request.id);
    }

    for (const request of linkedRequests || []) {
      await serviceRequests.delete(request.id);
    }

    const { error } = await supabase
      .from('service_request_projects')
      .delete()
      .eq('id', String(id));

    if (error) throw error;
    return true;
  }
}
