import { db, supabase } from '@/lib/db';
import { isNeedOpenForListing, isServiceRequestExpired } from '@/lib/service-request-allocation';
import { isHiddenNgoNetworkPaymentChannel } from '@/lib/razorpay-route';
import type { Tables } from '@/lib/database.types';
import {
  getListingUrgency,
  isCompanyAssignedNeed,
  isProjectLocked,
  shapeListingRequest,
  type ListingRequest,
  type ListingSource,
} from './list-shape';

export type ListingParams = {
  view: string | null;
  userId: number | null;
  category: string | null;
  projectId: string | null;
  search: string | null;
  location: string | null;
  requestType: string | null;
  urgency: string | null;
};

type ListingFilters = {
  category?: string;
  ngo_id?: number;
  project_id?: string;
};

/** Needs the volunteer has applied to, joined with requester, project and their application. */
async function fetchVolunteerResponses(userId: number, category: string | null): Promise<ListingSource[]> {
  const volunteerApplications = await db.serviceRequestApplications.getByVolunteerId(userId);
  const requestIds = volunteerApplications.map(app => app.service_request_id);

  if (requestIds.length === 0) return [];

  let query = supabase
    .from('service_requests')
    .select('*')
    .in('id', requestIds);

  if (category && category !== 'All Categories') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) throw error;
  const serviceRequests: ListingSource[] = data || [];
  if (serviceRequests.length === 0) return serviceRequests;

  const requesterIds = [...new Set(serviceRequests.map((item) => item.ngo_id))];
  const projectIds = [...new Set(serviceRequests.map((item) => item.project_id).filter((id): id is string => Boolean(id)))];
  const { data: users } = await supabase
    .from('users')
    .select('id, name, email, user_type, verification_status')
    .in('id', requesterIds);
  const { data: projects } = projectIds.length > 0
    ? await supabase
        .from('service_request_projects')
        .select('*')
        .in('id', projectIds)
    : { data: [] as Tables<'service_request_projects'>[] };

  return serviceRequests.map((request) => {
    const requester = users?.find((user) => user.id === request.ngo_id);
    const project = projects?.find((item) => item.id === request.project_id) || null;
    const volunteerApp = volunteerApplications.find(app => app.service_request_id === request.id);

    return {
      ...request,
      requester,
      project,
      volunteer_application: volunteerApp,
    };
  });
}

async function fetchListingSource(params: ListingParams): Promise<ListingSource[]> {
  const { view, userId, category, projectId } = params;

  if (view === 'my-responses' && userId) {
    return fetchVolunteerResponses(userId, category);
  }

  const filters: ListingFilters = {};
  if (category && category !== 'All Categories') {
    filters.category = category;
  }
  if (view === 'my-requests' && userId) {
    filters.ngo_id = userId;
  }
  if (projectId) {
    filters.project_id = projectId;
  }

  return db.serviceRequests.getAll(filters);
}

/** An NGO's own needs, minus anything already handed off to or funded by a company project. */
async function filterOwnUnassignedNeeds(requests: ListingRequest[]): Promise<ListingRequest[]> {
  const baseFiltered = requests.filter((item) => !isCompanyAssignedNeed(item) && !isProjectLocked(item));
  const filteredIds = baseFiltered
    .map((item) => Number(item.id))
    .filter((id: number) => Number.isFinite(id) && id > 0);

  if (filteredIds.length === 0) return baseFiltered;

  const { data: assignedContributions } = await supabase
    .from('service_request_contributions')
    .select('service_request_id, status, contribution_type')
    .in('service_request_id', filteredIds)
    .eq('contribution_type', 'company_project_csr')
    .in('status', ['accepted', 'in_progress', 'completed']);

  const assignedNeedIds = new Set(
    (assignedContributions || [])
      .map((item) => Number(item.service_request_id))
      .filter((id: number) => Number.isFinite(id) && id > 0)
  );

  return baseFiltered.filter((item) => !assignedNeedIds.has(Number(item.id)));
}

/** Public browse view: open, unassigned, unexpired needs that still have remaining capacity. */
async function filterBrowsableNeeds(requests: ListingRequest[]): Promise<ListingRequest[]> {
  const browsableRequests = requests.filter(
    (item) =>
      !isCompanyAssignedNeed(item) &&
      !isProjectLocked(item) &&
      !isServiceRequestExpired(item)
  );

  const requestsWithVolunteerCount = await Promise.all(
    browsableRequests.map(async (request) => {
      try {
        const { data: acceptedVolunteers, error: countError } = await supabase
          .from('service_request_applications')
          .select('id')
          .eq('service_request_id', request.id)
          .in('status', ['accepted', 'active', 'completed']);

        if (countError) {
          console.error('Supabase error counting volunteers for request', request.id, countError);
        }

        const acceptedCount = Array.isArray(acceptedVolunteers) ? acceptedVolunteers.length : 0;

        return {
          ...request,
          accepted_volunteers_count: acceptedCount,
          is_full: !isNeedOpenForListing(request)
        };
      } catch (error) {
        console.error('Error counting volunteers for request', request?.id, error);
        return {
          ...request,
          accepted_volunteers_count: 0,
          is_full: !isNeedOpenForListing(request)
        };
      }
    })
  );

  return requestsWithVolunteerCount.filter((request) => !request.is_full);
}

function applySearchFilters(requests: ListingRequest[], params: ListingParams): ListingRequest[] {
  const searchTerm = String(params.search || '').trim().toLowerCase();
  const locationTerm = String(params.location || '').trim().toLowerCase();
  const requestTypeFilter = String(params.requestType || '').trim();
  const urgencyFilter = String(params.urgency || '').trim().toLowerCase();

  if (!searchTerm && !locationTerm && !requestTypeFilter && !urgencyFilter) return requests;

  return requests.filter((item) => {
    if (requestTypeFilter && requestTypeFilter !== 'all' && requestTypeFilter !== 'All Types') {
      if (String(item.request_type || '').trim() !== requestTypeFilter) return false;
    }

    if (urgencyFilter && urgencyFilter !== 'all') {
      if (getListingUrgency(item) !== urgencyFilter) return false;
    }

    if (locationTerm) {
      const locationHaystack = [
        item.location,
        item.project?.location,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      if (!locationHaystack.includes(locationTerm)) return false;
    }

    if (searchTerm) {
      const searchHaystack = [
        item.title,
        item.description,
        item.category,
        item.request_type,
        item.ngo_name,
        item.requester?.name,
        item.location,
        item.tags,
      ]
        .map((value) => {
          if (Array.isArray(value)) return value.join(' ');
          return String(value || '');
        })
        .join(' ')
        .toLowerCase();
      if (!searchHaystack.includes(searchTerm)) return false;
    }

    return true;
  });
}

export async function listServiceRequests(params: ListingParams): Promise<ListingRequest[]> {
  const serviceRequests = await fetchListingSource(params);

  const processedRequests = (Array.isArray(serviceRequests) ? serviceRequests : [])
    .filter((request) => !isHiddenNgoNetworkPaymentChannel(request))
    .map(shapeListingRequest);

  let finalRequests = processedRequests;
  if (params.view === 'my-requests' && params.userId) {
    finalRequests = await filterOwnUnassignedNeeds(processedRequests);
  }
  if (params.view === 'all') {
    finalRequests = await filterBrowsableNeeds(processedRequests);
  }

  return applySearchFilters(finalRequests, params);
}
