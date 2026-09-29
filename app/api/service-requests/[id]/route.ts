import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getFundingProgress,
  isFinancialNeedType,
  resolveFundingTargetInr,
} from '@/lib/service-request-allocation';
import { getTokenClaims, CSR_ELIGIBILITY_REQUIRED_MESSAGE, CSR_OWN_PROJECT_TIMELINE_MESSAGE } from '@/lib/auth';
import { ngoUserIsCsrEligible, ngoUserIsCsrEligibleForProject } from '@/lib/server-auth';
import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_TYPES } from '@/lib/categories';
import { isHiddenNgoNetworkPaymentChannel } from '@/lib/razorpay-route';
import { ServiceRequestDeleteBlockedError } from '@/lib/service-requests/errors';
import { parseAmountToInr, parseJsonObject } from '@/lib/utils';

function parseImageArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    } catch {
      // fall through
    }
    return text.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimelineToDeadlineMs(timeline: unknown, baseMs: number): number | null {
  const text = String(timeline || '').trim();
  if (!text || /^(not specified|none|n\/a)$/i.test(text)) return null;

  const directDate = new Date(text);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.getTime();
  }

  const relativeMatch = text.match(/(\d+)\s*(day|days|week|weeks|month|months|year|years)/i);
  if (!relativeMatch) return null;

  const amount = Number(relativeMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = relativeMatch[2].toLowerCase();
  const multiplierMap: Record<string, number> = {
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000
  };

  return baseMs + (amount * (multiplierMap[unit] || multiplierMap.day));
}

function deriveAutoUrgency(timeline: unknown, createdAtMs: number): 'low' | 'medium' | 'high' | 'critical' {
  const deadlineMs = parseTimelineToDeadlineMs(timeline, createdAtMs);
  if (!deadlineMs) return 'medium';

  const totalDurationMs = deadlineMs - createdAtMs;
  if (totalDurationMs <= 0) return 'critical';

  const remainingMs = deadlineMs - Date.now();
  if (remainingMs <= 0) return 'critical';

  const remainingRatio = remainingMs / totalDurationMs;
  if (remainingRatio <= 0.15) return 'critical';
  if (remainingRatio <= 0.35) return 'high';
  if (remainingRatio <= 0.65) return 'medium';
  return 'low';
}

function buildProgressFields(body: Record<string, unknown>, existing?: Record<string, unknown> | null) {
  const targetAmount = parseAmount(body.target_amount ?? body.estimated_budget ?? body.budget ?? existing?.target_amount ?? existing?.estimated_budget ?? existing?.budget);
  const targetQuantity = parseAmount(body.target_quantity ?? body.quantity ?? body.volunteers_needed ?? body.beneficiary_count ?? existing?.target_quantity ?? existing?.quantity ?? existing?.volunteers_needed ?? existing?.beneficiary_count);
  const currentAmount = parseAmount(existing?.current_amount) ?? 0;
  const currentQuantity = parseAmount(existing?.current_quantity) ?? 0;

  return {
    target_amount: targetAmount,
    current_amount: currentAmount,
    target_quantity: targetQuantity,
    current_quantity: currentQuantity,
    remaining_amount: targetAmount != null ? Math.max(targetAmount - currentAmount, 0) : null,
    remaining_quantity: targetQuantity != null ? Math.max(targetQuantity - currentQuantity, 0) : null
  };
}

function isLockedCsrProject(request: { project_context?: unknown }): boolean {
  const projectContext = parseJsonObject(request?.project_context)
  const assignment = parseJsonObject(projectContext?.csr_assignment)
  return projectContext?.csr_project_available_for_csr === false || assignment?.mode === 'company_project_handoff' || Number(assignment?.assigned_company_id || 0) > 0
}

// GET - Fetch single service request
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = parseInt(id);

    const found = await db.serviceRequests.getById(requestId);

    if (!found) {
      return NextResponse.json({ 
        success: false, 
        error: 'Service request not found' 
      }, { status: 404 });
    }

    const requirements = parseJsonObject(found.requirements);
    const requirementImages = parseImageArray(requirements.images);
    const resolvedRequestType = found.request_type || requirements.request_type || (SERVICE_REQUEST_TYPES.includes(found.category) ? found.category : 'Skill / Service Need');
    const estimatedBudget = found.estimated_budget != null ? String(found.estimated_budget) : (requirements.estimated_budget || requirements.budget || 'Not specified');

    const serviceRequest: Record<string, unknown> = {
      ...found,
      ...(found.requester ? { ngo_name: found.requester.name } : {}),
      images: requirementImages.length > 0
        ? requirementImages
        : parseImageArray(found.image_url),
      request_type: resolvedRequestType,
      category: requirements.project_category || requirements?.project?.category || found.category || 'Uncategorized',
      estimated_budget: estimatedBudget,
      beneficiary_count: found.beneficiary_count != null ? Number(found.beneficiary_count) : Number(requirements.beneficiary_count || 0),
      impact_description: found.impact_description || requirements.impact_description || '',
    };

    const requestType = String(resolvedRequestType || requirements.request_type || '');
    if (isFinancialNeedType(requestType)) {
      const targetInr = resolveFundingTargetInr({
        funding_target_inr: requirements.funding_target_inr,
        target_amount: found.target_amount,
        estimated_budget: requirements.estimated_budget ?? estimatedBudget,
        budget: requirements.budget,
      });

      const funding = getFundingProgress(targetInr, parseAmountToInr(found.current_amount));
      serviceRequest.funding_target_inr = funding.target;
      serviceRequest.funds_raised_inr = funding.raised;
      serviceRequest.funds_remaining_inr = funding.remaining;
      serviceRequest.funding_progress = funding.progress;
    }

    return NextResponse.json({
      success: true,
      data: serviceRequest
    });

  } catch (error) {
    console.error('Error fetching service request:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch service request' 
      },
      { status: 500 }
    );
  }
}

// PUT - Update service request (NGOs only - can only update their own)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const decoded = getTokenClaims(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { id: userId, user_type: userType } = decoded;

    // Only NGOs can update service requests
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can update service requests' }, { status: 403 });
    }

    const requestId = parseInt(id);
    const body = await request.json();

    const { 
      title, 
      description, 
      category,
      project_category,
      request_type,
      location,
      timeline,
      budget,
      contactInfo,
      estimated_budget,
      beneficiary_count,
      impact_description,
      projectId,
      project,
      target_amount,
      target_quantity,
      project_context,
      images,
      details
    } = body;

    const missingRequiredFields = [title, description, location, timeline, impact_description].some((value) => !String(value ?? '').trim());
    if (missingRequiredFields || !request_type || !(project_category || category)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!beneficiary_count || Number(beneficiary_count) <= 0) {
      return NextResponse.json({ error: 'beneficiary_count must be greater than 0' }, { status: 400 });
    }

    const normalizedRequestType = request_type;
    const normalizedProjectCategory = project_category || category;
    const projectPayload = project && typeof project === 'object' ? project : null;
    const projectAvailabilityRaw = body.csr_project_available_for_csr ?? project?.csr_project_available_for_csr ?? project_context?.csr_project_available_for_csr;
    const projectAvailableForCsr = typeof projectAvailabilityRaw === 'boolean'
      ? projectAvailabilityRaw
      : projectAvailabilityRaw == null
        ? undefined
        : String(projectAvailabilityRaw).toLowerCase() !== 'false';

    if (projectAvailableForCsr === true && !(await ngoUserIsCsrEligible(userId))) {
      return NextResponse.json({ error: CSR_ELIGIBILITY_REQUIRED_MESSAGE }, { status: 403 });
    }

    const coverageThrough = {
      valid_until:
        projectPayload?.valid_until ||
        project?.valid_until ||
        project_context?.project_valid_until ||
        null,
      timeline:
        projectPayload?.timeline ||
        project?.timeline ||
        project_context?.project_timeline ||
        null,
    };
    if (
      projectAvailableForCsr === true &&
      !(await ngoUserIsCsrEligibleForProject(userId, coverageThrough))
    ) {
      return NextResponse.json({ error: CSR_OWN_PROJECT_TIMELINE_MESSAGE }, { status: 403 });
    }

    if (!SERVICE_REQUEST_TYPES.includes(normalizedRequestType)) {
      return NextResponse.json({ error: 'Invalid request_type. Use one of Financial Need, Material Need, Skill / Service Need, Infrastructure Project.' }, { status: 400 });
    }

    if (!CSR_SCHEDULE_VII_CATEGORIES.includes(normalizedProjectCategory)) {
      return NextResponse.json({ error: 'Invalid project_category. Select a valid Schedule VII category.' }, { status: 400 });
    }

    const trimmedTimeline = typeof timeline === 'string' ? timeline.trim() : '';
    const isAnytimeTimeline = trimmedTimeline.toLowerCase() === 'anytime';
    const storedTimeline = trimmedTimeline && !isAnytimeTimeline ? trimmedTimeline : null;
    const timelineLabel = isAnytimeTimeline ? 'Anytime' : (trimmedTimeline || 'Not specified');

    const existingRequest = await db.serviceRequests.getById(requestId);

    if (!existingRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (Number(existingRequest.ngo_id) !== userId) {
      return NextResponse.json({ error: 'You can only update your own requests' }, { status: 403 });
    }

    if (isLockedCsrProject(existingRequest)) {
      return NextResponse.json({ error: 'This need is locked because the parent project is already assigned to a company.' }, { status: 409 });
    }

    const progressFields = buildProgressFields({
      target_amount,
      target_quantity,
      estimated_budget,
      budget,
      beneficiary_count,
      volunteers_needed: body.volunteers_needed,
      quantity: body.quantity
    }, existingRequest);

    const sameNumber = (a: unknown, b: unknown) => (a == null ? null : Number(a)) === (b == null ? null : Number(b));
    const changesAllocationBasis =
      String(normalizedRequestType) !== String(existingRequest.request_type || '') ||
      !sameNumber(progressFields.target_amount, existingRequest.target_amount) ||
      !sameNumber(progressFields.target_quantity, existingRequest.target_quantity);

    if (changesAllocationBasis) {
      if (String(existingRequest.status || '').toLowerCase() !== 'active') {
        return NextResponse.json({ error: 'The need type and target can only be changed while the need is active.' }, { status: 409 });
      }
      const applicants = await db.serviceRequestApplications.getByRequestId(requestId);
      const hasAcceptedApplicant = (applicants || []).some((applicant) =>
        ['accepted', 'active', 'completed'].includes(String(applicant.status || '').toLowerCase())
      );
      if (hasAcceptedApplicant) {
        return NextResponse.json({ error: 'The need type and target cannot be changed after accepting an applicant.' }, { status: 409 });
      }
    }

    let resolvedProjectId: string | null = projectId || existingRequest.project_id || null;
    let resolvedProjectLocation = String(location || existingRequest.location || '').trim();

    if (projectPayload && !resolvedProjectId) {
      const projectTitle = String(projectPayload.title || '').trim();
      const projectDescription = String(projectPayload.description || '').trim();
      const projectLocation = String(projectPayload.exact_address || projectPayload.location || location || '').trim();
      const projectTimeline = String(projectPayload.timeline || timeline || '').trim();

      if (!projectTitle || !projectLocation) {
        return NextResponse.json({ error: 'Project title and exact address are required' }, { status: 400 });
      }

      if ([projectTitle, projectDescription, projectLocation, projectTimeline].some((value) => !value)) {
        return NextResponse.json({ error: 'Project title, description, exact address, and timeline are required' }, { status: 400 });
      }

      const rawExpected = projectPayload.expected_beneficiaries ?? null;
      const parsedExpected = rawExpected != null ? Number(rawExpected) : (Number(beneficiary_count) || null);
      const expectedBeneficiaries =
        parsedExpected != null && Number.isFinite(parsedExpected) && parsedExpected > 0 ? parsedExpected : null;
      const validUntil = projectPayload.valid_until ? String(projectPayload.valid_until).trim() : null;

      if (!expectedBeneficiaries) {
        return NextResponse.json({ error: 'expected_beneficiaries must be provided and greater than 0 for project creation' }, { status: 400 });
      }

      if (!validUntil || Number.isNaN(new Date(validUntil).getTime())) {
        return NextResponse.json({ error: 'valid_until must be a valid date string for project creation' }, { status: 400 });
      }

      const createdProject = await db.requestProjects.create({
        ngo_id: userId,
        title: projectTitle,
        description: projectDescription,
        location: projectLocation,
        exact_address: projectLocation,
        timeline: projectTimeline || null,
        expected_beneficiaries: expectedBeneficiaries,
        valid_until: validUntil || null,
        status: 'active'
      });

      resolvedProjectId = createdProject.id;
      resolvedProjectLocation = projectLocation;
    }

    let projectRecord: Awaited<ReturnType<typeof db.requestProjects.getById>> | null = null;
    if (resolvedProjectId) {
      projectRecord = await db.requestProjects.getById(String(resolvedProjectId));
      if (projectRecord && projectRecord.ngo_id !== userId) {
        return NextResponse.json({ error: 'Project ownership mismatch' }, { status: 403 });
      }

      resolvedProjectLocation = String(projectRecord?.exact_address || projectRecord?.location || resolvedProjectLocation || '').trim();

      if (projectPayload) {
        await db.requestProjects.update(String(resolvedProjectId), {
          title: String(projectPayload.title || '').trim() || undefined,
          description: String(projectPayload.description || '').trim() || null,
          location: String(projectPayload.exact_address || projectPayload.location || location || '').trim() || undefined,
          exact_address: String(projectPayload.exact_address || projectPayload.location || location || '').trim() || undefined,
          timeline: String(projectPayload.timeline || timeline || '').trim() || null,
          updated_at: new Date().toISOString()
        });
      }
    }

    const projectContext = {
      ...(parseJsonObject(project_context) || {}),
      project_category: normalizedProjectCategory,
      ...(projectAvailableForCsr === undefined ? {} : { csr_project_available_for_csr: projectAvailableForCsr }),
      project: resolvedProjectId
        ? { id: resolvedProjectId, exact_address: resolvedProjectLocation, category: normalizedProjectCategory, ...(projectAvailableForCsr === undefined ? {} : { csr_project_available_for_csr: projectAvailableForCsr }) }
        : projectPayload
          ? { ...projectPayload, ...(projectAvailableForCsr === undefined ? {} : { csr_project_available_for_csr: projectAvailableForCsr }) }
          : null
    };

    const createdAtMs = Number(new Date(existingRequest.created_at || Date.now()));
    const safeCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
    const mappedUrgency = deriveAutoUrgency(timeline, safeCreatedAtMs);

    const parsedImages = parseImageArray(images);

    const requirementsData = {
      request_type: normalizedRequestType,
      estimated_budget: estimated_budget || budget || 'Not specified',
      beneficiary_count: Number(beneficiary_count ?? (projectRecord?.expected_beneficiaries ?? 0)),
      impact_description: String(impact_description || '').trim(),
      budget: budget || estimated_budget || 'Not specified',
      contactInfo: contactInfo || 'Not specified',
      timeline: timelineLabel,
      project: projectContext,
      category_details: details || {},
      images: parsedImages
    };

    const updateData = {
      title,
      description,
      category: normalizedProjectCategory,
      location: resolvedProjectLocation || location,
      urgency_level: mappedUrgency,
      requirements: JSON.stringify(requirementsData),
      image_url: parsedImages[0] || null,
      updated_at: new Date().toISOString(),
      // Direct schema columns
      request_type: normalizedRequestType,
      estimated_budget: parseFloat(String(estimated_budget || budget || '')) || null,
      beneficiary_count: Number(beneficiary_count ?? (projectRecord?.expected_beneficiaries ?? 0)),
      impact_description: String(impact_description || '').trim(),
      timeline: storedTimeline,
      contact_info: contactInfo || null,
      project_id: resolvedProjectId,
      project_context: projectContext,
      ...progressFields
    };

    await db.serviceRequests.update(requestId, updateData);

    return NextResponse.json({
      success: true,
      data: { message: 'Service request updated successfully' }
    });

  } catch (error) {
    console.error('Error updating service request:', error);
    return NextResponse.json(
      { error: 'Failed to update service request' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a service request (NGOs only - can only delete their own)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params to get the id
    const { id } = await params;
    
    const decoded = getTokenClaims(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { id: userId, user_type: userType } = decoded;

    // Only NGOs can delete service requests
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can delete service requests' }, { status: 403 });
    }

    const requestId = parseInt(id);
    const forceDelete = new URL(request.url).searchParams.get('force') === 'true';

    const existingRequest = await db.serviceRequests.getById(requestId);

    if (!existingRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (Number(existingRequest.ngo_id) !== userId) {
      return NextResponse.json({ error: 'You can only delete your own service requests' }, { status: 403 });
    }

    if (isHiddenNgoNetworkPaymentChannel(existingRequest)) {
      return NextResponse.json({ error: 'This internal payment channel cannot be deleted' }, { status: 403 });
    }

    if (isLockedCsrProject(existingRequest)) {
      return NextResponse.json({ error: 'This need is locked because the parent project is already assigned to a company.' }, { status: 409 });
    }

    const applicants = await db.serviceRequestApplications.getByRequestId(requestId);
    const hasAcceptedApplicant = (applicants || []).some((applicant) =>
      ['accepted', 'active', 'completed'].includes(String(applicant.status || '').toLowerCase())
    );

    if (hasAcceptedApplicant && !forceDelete) {
      return NextResponse.json(
        { error: 'Cannot delete request after accepting an applicant' },
        { status: 400 }
      );
    }

    await db.serviceRequests.delete(requestId, userId);

    return NextResponse.json({
      success: true,
      message: 'Service request deleted successfully'
    });

  } catch (error) {
    if (error instanceof ServiceRequestDeleteBlockedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Error deleting service request:', error);
    return NextResponse.json(
      { error: 'Failed to delete service request' },
      { status: 500 }
    );
  }
}