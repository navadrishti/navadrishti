import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import {
  getFundingProgress,
  isFinancialNeedType,
  parseInrNumber,
  resolveFundingTargetInr,
  resolveFundsRaisedInr,
} from '@/lib/service-request-allocation';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';
import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_TYPES } from '@/lib/categories';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

function safeParseJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

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

function buildProgressFields(body: Record<string, any>, existing?: Record<string, any> | null) {
  const targetAmount = parseAmount(body.target_amount ?? body.estimated_budget ?? body.budget ?? existing?.target_amount ?? existing?.estimated_budget ?? existing?.budget);
  const targetQuantity = parseAmount(body.target_quantity ?? body.quantity ?? body.volunteers_needed ?? body.beneficiary_count ?? existing?.target_quantity ?? existing?.quantity ?? existing?.volunteers_needed ?? existing?.beneficiary_count);
  const currentAmount = parseAmount(body.current_amount ?? existing?.current_amount) ?? 0;
  const currentQuantity = parseAmount(body.current_quantity ?? existing?.current_quantity) ?? 0;

  return {
    target_amount: targetAmount,
    current_amount: currentAmount,
    target_quantity: targetQuantity,
    current_quantity: currentQuantity,
    remaining_amount: targetAmount != null ? Math.max(targetAmount - currentAmount, 0) : null,
    remaining_quantity: targetQuantity != null ? Math.max(targetQuantity - currentQuantity, 0) : null
  };
}

function isLockedCsrProject(request: Record<string, any>): boolean {
  const projectContext = safeParseJson(request?.project_context)
  const assignment = safeParseJson(projectContext?.csr_assignment)
  return projectContext?.csr_project_available_for_csr === false || assignment?.mode === 'company_project_handoff' || Number(assignment?.assigned_company_id || 0) > 0
}

// GET - Fetch single service request
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = parseInt(id);

    // Fetch the service request using Supabase helpers (simplified for now)
    const serviceRequest = await db.serviceRequests.getById(requestId);

    if (!serviceRequest) {
      console.log('Service request not found in database');
      return NextResponse.json({ 
        success: false, 
        error: 'Service request not found' 
      }, { status: 404 });
    }

    // Add ngo_name for backward compatibility with frontend
    if (serviceRequest.requester) {
      serviceRequest.ngo_name = serviceRequest.requester.name;
    }

    const requirements = safeParseJson(serviceRequest.requirements);
    const requirementImages = parseImageArray(requirements.images);
    serviceRequest.images = requirementImages.length > 0
      ? requirementImages
      : parseImageArray(serviceRequest.images || serviceRequest.image_url);
    // Prefer direct DB columns, fall back to requirements JSON for legacy rows
    serviceRequest.request_type = serviceRequest.request_type || requirements.request_type || (SERVICE_REQUEST_TYPES.includes(serviceRequest.category) ? serviceRequest.category : 'Skill / Service Need');
    serviceRequest.category = requirements.project_category || requirements?.project?.category || serviceRequest.category || 'Uncategorized';
    serviceRequest.estimated_budget = serviceRequest.estimated_budget != null ? String(serviceRequest.estimated_budget) : (requirements.estimated_budget || requirements.budget || 'Not specified');
    serviceRequest.beneficiary_count = serviceRequest.beneficiary_count != null ? Number(serviceRequest.beneficiary_count) : Number(requirements.beneficiary_count || 0);
    serviceRequest.impact_description = serviceRequest.impact_description || requirements.impact_description || '';

    const requestType = String(serviceRequest.request_type || requirements.request_type || '');
    if (isFinancialNeedType(requestType)) {
      let razorpayTotalInr = 0;
      try {
        const { data: orderRows } = await supabase
          .from('razorpay_payment_orders')
          .select('id')
          .eq('service_request_id', requestId);

        const orderIds = (orderRows || []).map((row: { id: unknown }) => row.id).filter(Boolean);
        if (orderIds.length > 0) {
          const { data: paymentRows } = await supabase
            .from('razorpay_payments')
            .select('amount_inr, payment_status')
            .in('order_id', orderIds)
            .eq('payment_status', 'captured');

          razorpayTotalInr = (paymentRows || []).reduce((sum: number, row: { amount_inr?: unknown }) => {
            return sum + parseInrNumber(row.amount_inr);
          }, 0);
        }
      } catch (paymentLookupError) {
        console.warn('Failed to aggregate Razorpay payments for service request:', paymentLookupError);
      }

      const targetInr = resolveFundingTargetInr({
        funding_target_inr: requirements.funding_target_inr,
        target_amount: serviceRequest.target_amount,
        estimated_budget: requirements.estimated_budget ?? serviceRequest.estimated_budget,
        budget: requirements.budget,
      });

      const raisedInr = resolveFundsRaisedInr({
        funds_raised_inr: requirements.funds_raised_inr,
        current_amount: serviceRequest.current_amount,
        financial_transactions: requirements.financial_transactions,
        razorpay_total_inr: razorpayTotalInr,
      });

      const funding = getFundingProgress(targetInr, raisedInr);
      serviceRequest.funding_target_inr = funding.target;
      serviceRequest.funds_raised_inr = funding.raised;
      serviceRequest.funds_remaining_inr = funding.remaining;
      serviceRequest.funding_progress = funding.progress;
    }

    // Return the service request data (publicly accessible)
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
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
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
      current_amount,
      current_quantity,
      project_context,
      images,
      details
    } = body;

    // Validate required fields
    const missingRequiredFields = [title, description, location, timeline, impact_description].some((value) => !String(value ?? '').trim());
    if (missingRequiredFields || !request_type || !(project_category || category)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!beneficiary_count || Number(beneficiary_count) <= 0) {
      return NextResponse.json({ error: 'beneficiary_count must be greater than 0' }, { status: 400 });
    }

    const normalizedRequestType = request_type;
    const normalizedProjectCategory = project_category || category;
    const projectAvailabilityRaw = body.csr_project_available_for_csr ?? project?.csr_project_available_for_csr ?? project_context?.csr_project_available_for_csr;
    const projectAvailableForCsr = typeof projectAvailabilityRaw === 'boolean'
      ? projectAvailabilityRaw
      : projectAvailabilityRaw == null
        ? undefined
        : String(projectAvailabilityRaw).toLowerCase() !== 'false';

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

    // First, verify that this request belongs to the authenticated NGO
    const existingRequest = await db.serviceRequests.getById(requestId);

    if (!existingRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (existingRequest.requester_id !== userId) {
      return NextResponse.json({ error: 'You can only update your own requests' }, { status: 403 });
    }

    if (isLockedCsrProject(existingRequest)) {
      return NextResponse.json({ error: 'This need is locked because the parent project is already assigned to a company.' }, { status: 409 });
    }

    let resolvedProjectId: string | null = projectId || existingRequest.project_id || null;
    let resolvedProjectLocation = String(location || existingRequest.location || '').trim();
    const projectPayload = project && typeof project === 'object' ? project : null;

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

      // Validate canonical project fields for nested project creation
      const rawExpected = projectPayload.expected_beneficiaries ?? null;
      const parsedExpected = rawExpected != null ? Number(rawExpected) : (Number(beneficiary_count) || null);
      const expectedBeneficiaries = Number.isFinite(parsedExpected) && parsedExpected > 0 ? parsedExpected : null;
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

    if (resolvedProjectId) {
      const projectRecord = await db.requestProjects.getById(String(resolvedProjectId));
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
      ...(safeParseJson(project_context) || {}),
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

    // Prepare requirements JSON
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

    const progressFields = buildProgressFields({
      target_amount,
      target_quantity,
      current_amount,
      current_quantity,
      estimated_budget,
      budget,
      beneficiary_count,
      volunteers_needed: body.volunteers_needed,
      quantity: body.quantity
    }, existingRequest);

    // Update the service request using Supabase helper
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
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    // Only NGOs can delete service requests
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can delete service requests' }, { status: 403 });
    }

    const requestId = parseInt(id);
    const forceDelete = new URL(request.url).searchParams.get('force') === 'true';

    // First, verify that this request belongs to the authenticated NGO and delete it
    const existingRequest = await db.serviceRequests.getById(requestId);

    if (!existingRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (existingRequest.requester_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own service requests' }, { status: 403 });
    }

    if (isLockedCsrProject(existingRequest)) {
      return NextResponse.json({ error: 'This need is locked because the parent project is already assigned to a company.' }, { status: 409 });
    }

    const applicants = await db.serviceVolunteers.getByRequestId(requestId);
    const hasAcceptedApplicant = (applicants || []).some((applicant: any) =>
      ['accepted', 'active', 'completed'].includes(String(applicant.status || '').toLowerCase())
    );

    if (hasAcceptedApplicant && !forceDelete) {
      return NextResponse.json(
        { error: 'Cannot delete request after accepting an applicant' },
        { status: 400 }
      );
    }

    // Delete the service request (which will also delete related volunteers)
    await db.serviceRequests.delete(requestId, userId);

    return NextResponse.json({
      success: true,
      message: 'Service request deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting service request:', error);
    return NextResponse.json(
      { error: 'Failed to delete service request' },
      { status: 500 }
    );
  }
}