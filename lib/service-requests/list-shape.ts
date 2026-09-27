import { SERVICE_REQUEST_TYPES } from '@/lib/categories';
import { getRequestUrgencyLevel, parseJsonObject } from '@/lib/utils';
import type { Tables } from '@/lib/database.types';
import { parseImageArray } from './parsing';

type ListingRequester = Pick<Tables<'users'>, 'id' | 'name' | 'email' | 'user_type'> & {
  verification_status?: Tables<'users'>['verification_status'];
};

export type ListingSource = Tables<'service_requests'> & {
  requester?: ListingRequester;
  project?: Tables<'service_request_projects'> | null;
  volunteer_application?: unknown;
  volunteers_count?: number;
};

type ListingProject = {
  id: string;
  title: string;
  location: string;
  timeline: string;
  category: string;
};

/** A listing row enriched with parsed requirements, a flattened project summary and derived scores. */
export type ListingRequest = Omit<ListingSource, 'project' | 'estimated_budget'> & {
  project: ListingProject | null | undefined;
  estimated_budget: string;
  ngo_name?: string;
  images: string[];
  request_type: string;
  category: string;
  beneficiary_count: number;
  impact_description: string;
  trust_badge_weight: number;
  verified: boolean;
  impact_score: number;
  proof_strength: number;
  completion_rate: number;
};

type Urgency = 'low' | 'medium' | 'high' | 'critical';

export function isCompanyAssignedNeed(request: { project_context?: unknown; requirements?: unknown }): boolean {
  const projectContext = parseJsonObject(request?.project_context);
  const requirements = parseJsonObject(request?.requirements);

  const assignmentFromContext = parseJsonObject(projectContext?.csr_assignment);
  const assignmentFromRequirements = parseJsonObject(requirements?.csr_assignment);

  const assignedCompanyId = Number(
    assignmentFromContext?.assigned_company_id ??
    projectContext?.assigned_company_id ??
    assignmentFromRequirements?.assigned_company_id
  );

  const assignmentMode = String(assignmentFromContext?.mode || '').toLowerCase();
  const handoffFlag = Boolean(
    assignmentFromContext?.mode ||
    assignmentFromContext?.assigned_at ||
    projectContext?.handoff_to_company
  );

  return (Number.isFinite(assignedCompanyId) && assignedCompanyId > 0) || handoffFlag || assignmentMode === 'company_project_handoff';
}

export function isProjectLocked(item: { project_context?: unknown }): boolean {
  const projectContext = parseJsonObject(item?.project_context);
  const assignment = parseJsonObject(projectContext?.csr_assignment);
  return projectContext?.csr_project_available_for_csr === false || assignment?.mode === 'company_project_handoff' || Number(assignment?.assigned_company_id || 0) > 0;
}

function computeImpactScore(request: {
  beneficiary_count?: unknown;
  urgency_level?: unknown;
  requester?: { verification_status?: string | null } | null;
}): number {
  const urgencyWeight: Record<string, number> = {
    low: 10,
    medium: 20,
    high: 30,
    critical: 40
  };

  const beneficiaryCount = Number(request.beneficiary_count || 0);
  const beneficiaryScore = Math.min(40, Math.floor(beneficiaryCount / 10) * 4);
  const urgencyScore = urgencyWeight[String(request.urgency_level || 'medium')] || 20;
  const verificationScore = request.requester?.verification_status === 'verified' ? 20 : 10;

  return Math.max(0, Math.min(100, beneficiaryScore + urgencyScore + verificationScore));
}

function computeProofStrength(request: { images?: unknown }): number {
  let score = 0;
  const images = Array.isArray(request.images) ? request.images : [];

  if (images.length > 0) score += Math.min(30, images.length * 10);

  return Math.max(0, Math.min(100, score));
}

/** Same deadline resolution the listing card uses for live urgency badges. */
function resolveListingDeadline(item: ListingRequest): string | null {
  const requirements = parseJsonObject(item?.requirements);
  const projectContext: Record<string, unknown> | null = item?.project || requirements?.project?.project || null;
  const candidates = [
    projectContext?.valid_until,
    item?.deadline,
    item?.timeline,
    requirements?.timeline,
  ];

  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) return text;
  }

  return null;
}

export function getListingUrgency(item: ListingRequest): Urgency {
  return getRequestUrgencyLevel({
    createdAt: item?.created_at,
    deadline: resolveListingDeadline(item),
    fallback: item?.urgency_level || 'medium',
  });
}

function summarizeProject(
  request: ListingSource,
  projectContextObj: ReturnType<typeof parseJsonObject>,
  category: string
): ListingProject | null | undefined {
  if (request.project) {
    return {
      id: String(request.project.id || ''),
      title: String(request.project.title || projectContextObj?.project_title || 'Project'),
      location: String(request.project.location || request.project.exact_address || projectContextObj?.project_location || ''),
      timeline: String(request.project.timeline || projectContextObj?.project_timeline || ''),
      category: String(projectContextObj?.project_category || category || '')
    };
  }

  if (projectContextObj && projectContextObj.project) {
    return {
      id: String(projectContextObj.project.id || ''),
      title: String(projectContextObj.project_title || projectContextObj.project.title || ''),
      location: String(projectContextObj.project_location || projectContextObj.project.exact_address || ''),
      timeline: String(projectContextObj.project_timeline || projectContextObj.project.timeline || ''),
      category: String(projectContextObj.project_category || projectContextObj.project.category || '')
    };
  }

  return request.project;
}

/**
 * Older needs stored budget/contact/timeline concatenated into the description.
 * Split those back out so the listing shows a clean description.
 */
function normalizeLegacyFields(request: ListingSource) {
  let description = request.description;
  let requirements = request.requirements;
  let deadline = request.deadline;

  if (description && (description.includes('Budget:') || description.includes('Requirements:'))) {
    const lines = description.split('\n');
    description = lines[0];

    const fullText = lines.join('\n');
    const budgetMatch = fullText.match(/Budget:\s*([^\n]*)/);
    const contactMatch = fullText.match(/Contact:\s*([^\n]*)/);
    const timelineMatch = fullText.match(/Timeline:\s*([^\n]*)/);

    try {
      const existingRequirements = requirements ? JSON.parse(String(requirements)) : {};
      requirements = JSON.stringify({
        ...existingRequirements,
        budget: budgetMatch ? budgetMatch[1].trim() : null,
        contactInfo: contactMatch ? contactMatch[1].trim() : null,
        timeline: timelineMatch ? timelineMatch[1].trim() : null
      });

      if (timelineMatch && timelineMatch[1].trim()) {
        deadline = timelineMatch[1].trim();
      }
    } catch (e) {
      console.error('Error parsing old format data:', e);
    }
  }

  // ISO timestamps in `deadline` were auto-filled, not chosen by the NGO.
  const deadlineStr = String(deadline || '');
  if (deadlineStr && (deadlineStr.includes('T') && deadlineStr.includes('Z'))) {
    deadline = null;
  }

  return { description, requirements, deadline };
}

export function shapeListingRequest(request: ListingSource): ListingRequest {
  const requirementsObj = parseJsonObject(request.requirements);
  const projectContextObj = parseJsonObject(request.project_context);
  const requirementImages = parseImageArray(requirementsObj.images);
  const images = requirementImages.length > 0
    ? requirementImages
    : parseImageArray(request.image_url);

  const category: string = requirementsObj.project_category || requirementsObj?.project?.category || request.category || 'Uncategorized';
  const beneficiaryCount = request.beneficiary_count != null ? Number(request.beneficiary_count) : Number(requirementsObj.beneficiary_count || 0);
  const project = summarizeProject(request, projectContextObj, category);
  const { description, requirements, deadline } = normalizeLegacyFields(request);

  return {
    ...request,
    ...(request.requester ? { ngo_name: request.requester.name } : {}),
    images,
    request_type: request.request_type || requirementsObj.request_type || (SERVICE_REQUEST_TYPES.includes(request.category) ? request.category : 'Skill / Service Need'),
    category,
    estimated_budget: request.estimated_budget != null ? String(request.estimated_budget) : (requirementsObj.estimated_budget || requirementsObj.budget || 'Not specified'),
    beneficiary_count: beneficiaryCount,
    impact_description: request.impact_description || requirementsObj.impact_description || '',
    trust_badge_weight: request.requester?.verification_status === 'verified' ? 1.0 : 0.6,
    verified: String(request.requester?.verification_status || '').toLowerCase() === 'verified',
    impact_score: computeImpactScore({ ...request, beneficiary_count: beneficiaryCount }),
    proof_strength: computeProofStrength({ images }),
    completion_rate: request.status === 'completed' ? 100 : 0,
    project,
    description,
    requirements,
    deadline,
  };
}
