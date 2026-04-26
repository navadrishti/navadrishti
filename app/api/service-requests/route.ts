import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';
import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_TYPES } from '@/lib/categories';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
  verification_status?: string;
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

function isCompanyAssignedNeed(request: Record<string, any>): boolean {
  const projectContext = safeParseJson(request?.project_context);
  const requirements = safeParseJson(request?.requirements);

  const assignmentFromContext = safeParseJson(projectContext?.csr_assignment);
  const assignmentFromRequirements = safeParseJson(requirements?.csr_assignment);

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

function computeImpactScore(request: any): number {
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

function computeProofStrength(request: any): number {
  let score = 0;
  const images = Array.isArray(request.images) ? request.images : [];

  if (images.length > 0) score += Math.min(30, images.length * 10);

  return Math.max(0, Math.min(100, score));
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
  if (!text || /^(anytime|not specified|none|n\/a)$/i.test(text)) return null;

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

function mapRequestTypeToOfferType(requestType: string): string | null {
  if (requestType === 'Financial Need') return 'financial';
  if (requestType === 'Material Need') return 'material';
  if (requestType === 'Skill / Service Need') return 'service';
  if (requestType === 'Infrastructure Project') return 'infrastructure';
  return null;
}

function getTargetCoverageForRequestType(requestType: string, payload: Record<string, any>): number | null {
  const financialTarget = parseAmount(payload.target_amount ?? payload.estimated_budget ?? payload.budget);
  const quantityTarget = parseAmount(payload.target_quantity ?? payload.beneficiary_count ?? payload.volunteers_needed);

  if (requestType === 'Financial Need' || requestType === 'Infrastructure Project') {
    return financialTarget;
  }

  if (requestType === 'Material Need' || requestType === 'Skill / Service Need') {
    return quantityTarget;
  }

  return null;
}

function getOfferCapacityForRequestType(requestType: string, offer: Record<string, any>): number | null {
  const requirements = safeParseJson(offer.requirements);
  const requirementAmount = requirements.amount ?? requirements.sell_amount ?? requirements.price_amount;
  const requirementQuantity = requirements.quantity ?? requirements.target_quantity;
  const requirementCapacity = requirements.capacity;

  if (requestType === 'Financial Need') {
    return parseAmount(offer.amount ?? offer.sell_amount ?? offer.price_amount ?? requirementAmount);
  }
  if (requestType === 'Material Need') {
    return parseAmount(offer.quantity ?? requirementQuantity);
  }
  if (requestType === 'Skill / Service Need') {
    return parseAmount(offer.capacity ?? requirementCapacity);
  }
  if (requestType === 'Infrastructure Project') {
    return parseAmount(
      offer.amount ??
      offer.sell_amount ??
      offer.capacity ??
      offer.price_amount ??
      requirementAmount ??
      requirementCapacity
    );
  }
  return null;
}

// GET - Fetch service requests (public endpoint - no auth required for viewing)
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const userId = searchParams.get('userId');
    const projectId = searchParams.get('projectId');
    const rawView = searchParams.get('view'); // 'all', 'my-requests', 'my-responses' (legacy: 'volunteering')
    const view = rawView === 'volunteering' ? 'my-responses' : rawView;

    // For my-requests view, authenticate user
    let authenticatedUserId = null;
    if (view === 'my-requests' || view === 'my-responses') {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      const token = authHeader.substring(7);
      try {
        const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
        authenticatedUserId = payload.id;
        
        if (view === 'my-requests') {
          // Only NGOs can have requests
          if (payload.user_type !== 'ngo') {
            return NextResponse.json({ 
              success: true, 
              data: [] // Return empty array for non-NGOs
            });
          }
        } else if (view === 'my-responses') {
          // Only individuals can volunteer directly on requests
          if (payload.user_type !== 'individual') {
            return NextResponse.json({ 
              success: true, 
              data: []
            });
          }
        }
      } catch (error) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }

    // Use Supabase database helpers
    const filters: any = {};
    if (category && category !== 'All Categories') {
      filters.category = category;
    }
    if (view === 'my-requests' && authenticatedUserId) {
      filters.requester_id = authenticatedUserId;
    }
    if (projectId) {
      filters.project_id = projectId;
    }
    
    let serviceRequests;
    if (view === 'my-responses' && authenticatedUserId) {
      // For volunteering view, get service requests where user has applied
      const volunteerApplications = await db.serviceVolunteers.getByVolunteerId(authenticatedUserId);
      const requestIds = volunteerApplications.map(app => app.service_request_id);
      
      if (requestIds.length === 0) {
        serviceRequests = [];
      } else {
        // Get the service requests for these IDs with filtering
        let query = supabase
          .from('service_requests')
          .select('*')
          .in('id', requestIds);
        
        // Apply category filter if specified
        if (category && category !== 'All Categories') {
          query = query.eq('category', category);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        serviceRequests = data || [];
        
        // Fetch requester data separately and merge
        if (serviceRequests.length > 0) {
          const requesterIds = [...new Set(serviceRequests.map((item: any) => item.ngo_id))];
          const projectIds = [...new Set(serviceRequests.map((item: any) => item.project_id).filter(Boolean))];
          const { data: users } = await supabase
            .from('users')
            .select('id, name, email, user_type')
            .in('id', requesterIds);
          const { data: projects } = projectIds.length > 0
            ? await supabase
                .from('service_request_projects')
                .select('*')
                .in('id', projectIds)
            : { data: [] as any[] };
          
          // Merge requester data and volunteer application data
          serviceRequests = serviceRequests.map((request: any) => {
            const requester = users?.find((user: any) => user.id === request.ngo_id);
            const project = projects?.find((item: any) => item.id === request.project_id) || null;
            const volunteerApp = volunteerApplications.find(app => app.service_request_id === request.id);
            
            return {
              ...request,
              requester,
              project,
              volunteer_application: volunteerApp,
              // Add requester_id for backward compatibility
              requester_id: request.ngo_id
            };
          });
        }
      }
    } else {
      serviceRequests = await db.serviceRequests.getAll(filters);
    }

  // Ensure we have an array to process and handle old/new formats
  const requestsToProcess = Array.isArray(serviceRequests) ? serviceRequests : [];
  // Process the data to handle old and new formats
  const processedRequests = requestsToProcess.map((request: any) => {
      // Add ngo_name for backward compatibility with frontend
      if (request.requester) {
        request.ngo_name = request.requester.name;
      }

      const requirementsObj = safeParseJson(request.requirements);
      // Prefer direct DB columns, fall back to requirements JSON for legacy rows
      request.request_type = request.request_type || requirementsObj.request_type || (SERVICE_REQUEST_TYPES.includes(request.category) ? request.category : 'Skill / Service Need');
      request.category = requirementsObj.project_category || requirementsObj?.project?.category || request.category || 'Uncategorized';
      request.estimated_budget = request.estimated_budget != null ? String(request.estimated_budget) : (requirementsObj.estimated_budget || requirementsObj.budget || 'Not specified');
      request.beneficiary_count = request.beneficiary_count != null ? Number(request.beneficiary_count) : Number(requirementsObj.beneficiary_count || 0);
      request.impact_description = request.impact_description || requirementsObj.impact_description || '';
      request.trust_badge_weight = request.requester?.verification_status === 'verified' ? 1.0 : 0.6;
      request.impact_score = computeImpactScore(request);
      request.proof_strength = computeProofStrength(request);
      request.completion_rate = request.status === 'completed' ? 100 : 0;
      
      // Handle old concatenated description format
      if (request.description && (request.description.includes('Budget:') || request.description.includes('Requirements:'))) {
        // Split by newlines and extract parts
        const lines = request.description.split('\n');
        request.description = lines[0]; // Just the actual description
        
        // Extract additional info from the concatenated format
        const fullText = lines.join('\n');
        const budgetMatch = fullText.match(/Budget:\s*([^\n]*)/);
        const contactMatch = fullText.match(/Contact:\s*([^\n]*)/);
        const timelineMatch = fullText.match(/Timeline:\s*([^\n]*)/);
        
        // Store the extracted info in requirements field for consistency
        try {
          const existingRequirements = request.requirements ? JSON.parse(request.requirements) : {};
          request.requirements = JSON.stringify({
            ...existingRequirements,
            budget: budgetMatch ? budgetMatch[1].trim() : null,
            contactInfo: contactMatch ? contactMatch[1].trim() : null,
            timeline: timelineMatch ? timelineMatch[1].trim() : null
          });
          
          // Update deadline with timeline if found
          if (timelineMatch && timelineMatch[1].trim()) {
            request.deadline = timelineMatch[1].trim();
          }
        } catch (e) {
          // If parsing fails, leave as is
          console.error('Error parsing old format data:', e);
        }
      }
      
      // Handle fake deadline - clear timestamp-style deadlines
      const deadlineStr = String(request.deadline || '');
      if (deadlineStr && (deadlineStr.includes('T') && deadlineStr.includes('Z'))) {
        request.deadline = null;
      }
      
      return request;
    });

    // Filter out completed requests from "All Requests" view
    let finalRequests = processedRequests;

    if (view === 'my-requests' && authenticatedUserId) {
      const baseFiltered = processedRequests.filter((item: any) => !isCompanyAssignedNeed(item));
      const filteredIds = baseFiltered
        .map((item: any) => Number(item.id))
        .filter((id: number) => Number.isFinite(id) && id > 0);

      if (filteredIds.length > 0) {
        const { data: assignedContributions } = await supabase
          .from('service_request_contributions')
          .select('service_request_id, status, contribution_type')
          .in('service_request_id', filteredIds)
          .eq('contribution_type', 'company_project_csr')
          .in('status', ['accepted', 'in_progress', 'completed']);

        const assignedNeedIds = new Set(
          (assignedContributions || [])
            .map((item: any) => Number(item.service_request_id))
            .filter((id: number) => Number.isFinite(id) && id > 0)
        );

        finalRequests = baseFiltered.filter((item: any) => !assignedNeedIds.has(Number(item.id)));
      } else {
        finalRequests = baseFiltered;
      }
    }

    if (view === 'all') {
      // For each request, check if it has reached its volunteer limit
      const safeProcessed = Array.isArray(processedRequests) ? processedRequests : [];

      const requestsWithVolunteerCount = await Promise.all(
        safeProcessed.map(async (request: any) => {
          // Defensive defaults in case request is unexpectedly null/undefined
          if (!request || typeof request !== 'object') {
            console.warn('Skipping invalid request during volunteer count:', request);
            return { accepted_volunteers_count: 0, is_full: false };
          }

          try {
            const { data: acceptedVolunteers, error: countError } = await supabase
              .from('service_volunteers')
              .select('id')
              .eq('service_request_id', request.id)
              .in('status', ['accepted', 'active', 'completed']);

            if (countError) {
              console.error('Supabase error counting volunteers for request', request.id, countError);
            }

            const acceptedCount = Array.isArray(acceptedVolunteers) ? acceptedVolunteers.length : 0;
            const volunteerLimit = request.volunteer_limit || request.volunteers_needed || 1;
            const isFull = acceptedCount >= volunteerLimit;

            return {
              ...request,
              accepted_volunteers_count: acceptedCount,
              is_full: isFull
            };
          } catch (error) {
            console.error('Error counting volunteers for request', request?.id, error);
            return {
              ...request,
              accepted_volunteers_count: 0,
              is_full: false
            };
          }
        })
      );

      // Filter out requests that are full (unless user is viewing their own requests)
      const filteredRequests = requestsWithVolunteerCount.filter((request: any) => !request.is_full);
      finalRequests = filteredRequests;
    }

    return NextResponse.json({
      success: true,
      data: finalRequests
    });

  } catch (error) {
    console.error('Error fetching service requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service requests' },
      { status: 500 }
    );
  }
}

// POST - Create new service request (NGOs only) or volunteer for request
export async function POST(request: NextRequest) {
  try {
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch (jwtError) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    const { id: userId, user_type: userType, verification_status } = decoded;

    const body = await request.json();
    const { action } = body;

    // If no action is specified, assume it's a create operation
    if (!action || action === 'create') {

      
      // Only verified NGOs can create service requests
      if (userType !== 'ngo') {
        return NextResponse.json({ 
          error: 'Only verified NGOs can create service requests'
        }, { status: 403 });
      }
      
      if (verification_status !== 'verified') {
        return NextResponse.json({ 
          error: 'You need to complete verification before creating service requests.',
          requiresVerification: true
        }, { status: 403 });
      }

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
        details
      } = body;

      // Validate required fields
      const missingRequiredFields = [title, description, location, timeline, budget, contactInfo, impact_description].some((value) => !String(value ?? '').trim());
      if (missingRequiredFields || !request_type || !(project_category || category)) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      if (!beneficiary_count || Number(beneficiary_count) <= 0) {
        return NextResponse.json(
          { error: 'beneficiary_count must be greater than 0 (How many benefit?)' },
          { status: 400 }
        );
      }

      const normalizedRequestType = request_type;
      const normalizedProjectCategory = project_category || category;

      if (!SERVICE_REQUEST_TYPES.includes(normalizedRequestType)) {
        return NextResponse.json(
          { error: 'Invalid request_type. Use one of Financial Need, Material Need, Skill / Service Need, Infrastructure Project.' },
          { status: 400 }
        );
      }

      if (!CSR_SCHEDULE_VII_CATEGORIES.includes(normalizedProjectCategory)) {
        return NextResponse.json(
          { error: 'Invalid project_category. Select a valid Schedule VII category.' },
          { status: 400 }
        );
      }

      let resolvedProjectId: string | null = projectId || null;
      let resolvedProjectLocation = String(location || '').trim();
      const projectPayload = project && typeof project === 'object' ? project : null;
      if (projectPayload && !resolvedProjectId) {
        const projectTitle = String(projectPayload.title || '').trim();
        const projectDescription = String(projectPayload.description || '').trim();
        const projectLocation = String(projectPayload.exact_address || projectPayload.location || location || '').trim();
        const projectTimeline = String(projectPayload.timeline || timeline || '').trim();

        if ([projectTitle, projectDescription, projectLocation, projectTimeline].some((value) => !value)) {
          return NextResponse.json({ error: 'Project title, description, exact address, and timeline are required' }, { status: 400 });
        }

        const createdProject = await db.requestProjects.create({
          ngo_id: userId,
          title: projectTitle,
          description: projectDescription,
          location: projectLocation,
          exact_address: projectLocation,
          timeline: projectTimeline || null,
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
      }

      const projectContext = {
        ...(safeParseJson(project_context) || {}),
        project_category: normalizedProjectCategory,
        project: resolvedProjectId
          ? { id: resolvedProjectId, exact_address: resolvedProjectLocation, category: normalizedProjectCategory }
          : projectPayload || null
      };

      const trimmedTimeline = typeof timeline === 'string' ? timeline.trim() : '';
      const isAnytimeTimeline = trimmedTimeline.toLowerCase() === 'anytime';
      const storedTimeline = trimmedTimeline && !isAnytimeTimeline ? trimmedTimeline : null;
      const timelineLabel = isAnytimeTimeline ? 'Anytime' : (trimmedTimeline || 'Not specified');

      const mappedUrgency = deriveAutoUrgency(timeline, Date.now());

      const selectedRecommendedOfferIds: number[] = Array.isArray(details?.recommended_offer_ids)
        ? details.recommended_offer_ids
            .map((value: any) => Number(value))
            .filter((value: number) => Number.isFinite(value) && value > 0)
        : [];

      const expectedOfferType = mapRequestTypeToOfferType(normalizedRequestType);
      const coverageTarget = getTargetCoverageForRequestType(normalizedRequestType, {
        target_amount,
        estimated_budget,
        budget,
        target_quantity,
        beneficiary_count,
        volunteers_needed: body.volunteers_needed
      });

      if (expectedOfferType) {
        const { data: matchingOffers, error: matchingOffersError } = await supabase
          .from('service_offers')
          .select('id, status, offer_type, price_amount, requirements')
          .eq('offer_type', expectedOfferType)
          .eq('status', 'active')
          .limit(60);

        if (matchingOffersError) throw matchingOffersError;

        const offers = Array.isArray(matchingOffers) ? matchingOffers : [];
        const offersWithCoverage = offers.map((offer: any) => ({
          ...offer,
          capacity: getOfferCapacityForRequestType(normalizedRequestType, offer)
        }));
        const directlyFulfillableOffers = offersWithCoverage.filter((offer: any) => (offer.capacity ?? 0) > 0);

        if (directlyFulfillableOffers.length > 0 && selectedRecommendedOfferIds.length === 0) {
          return NextResponse.json(
            {
              error: 'Matching capability offers found. Select one or more capability offers before creating this need.',
              requiresOfferSelection: true,
              matching_offer_ids: directlyFulfillableOffers.map((offer: any) => offer.id)
            },
            { status: 400 }
          );
        }

        if (selectedRecommendedOfferIds.length > 0) {
          const selectedOffers = offersWithCoverage.filter((offer: any) => selectedRecommendedOfferIds.includes(Number(offer.id)));

          if (selectedOffers.length !== selectedRecommendedOfferIds.length) {
            return NextResponse.json({ error: 'One or more selected capability offers are invalid for this need.' }, { status: 400 });
          }

          if (coverageTarget && coverageTarget > 0) {
            const combinedCoverage = selectedOffers.reduce((sum: number, offer: any) => sum + (offer.capacity || 0), 0);
            if (combinedCoverage < coverageTarget) {
              return NextResponse.json(
                {
                  error: 'Selected capability offers do not fully cover the need target. Select additional offers to reach full coverage.',
                  requiresOfferSelection: true,
                  coverage_target: coverageTarget,
                  combined_coverage: combinedCoverage
                },
                { status: 400 }
              );
            }
          }
        }
      }

      // Prepare requirements JSON
      const requirementsData = {
        request_type: normalizedRequestType,
        estimated_budget: estimated_budget || budget || 'Not specified',
        beneficiary_count: Number(beneficiary_count || 0),
        impact_description: String(impact_description || '').trim(),
        budget: budget || estimated_budget || 'Not specified',
        contactInfo: contactInfo || 'Not specified',
        timeline: timelineLabel,
        project: projectContext,
        category_details: details || {}
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
      });

      // Insert new service request using Supabase helpers
      const requestData = {
        ngo_id: userId,
        title: title,
        description: description,
        category: normalizedProjectCategory,
        location: resolvedProjectLocation || location,
        urgency_level: mappedUrgency,
        volunteers_needed: 1, // default volunteers_needed
        tags: JSON.stringify([]), // empty tags array
        requirements: JSON.stringify(requirementsData),
        status: 'active',
        // Direct schema columns
        request_type: normalizedRequestType,
        estimated_budget: parseFloat(String(estimated_budget || budget || '')) || null,
        beneficiary_count: Number(beneficiary_count || 0),
        impact_description: String(impact_description || '').trim(),
        timeline: storedTimeline,
        contact_info: contactInfo || null,
        project_id: resolvedProjectId,
        project_context: projectContext,
        ...progressFields
      };

      const result = await db.serviceRequests.create(requestData);

        return NextResponse.json({
          success: true,
          data: { id: result.id, message: 'Service request created successfully' }
        });    } else if (action === 'volunteer') {
      // Only individuals and companies can volunteer
      if (userType === 'ngo') {
        return NextResponse.json({ error: 'NGOs cannot volunteer for their own requests' }, { status: 403 });
      }

      const { serviceRequestId, message } = body;

      if (!serviceRequestId) {
        return NextResponse.json({ error: 'Service request ID is required' }, { status: 400 });
      }

      // Check if already volunteering using Supabase helper
      const existing = await db.serviceVolunteers.findExisting(serviceRequestId, userId);

      if (existing) {
        return NextResponse.json({ error: 'Already volunteering for this request' }, { status: 400 });
      }

      // Add volunteer using Supabase helper
      const volunteerData = {
        service_request_id: serviceRequestId,
        volunteer_id: userId,
        volunteer_type: userType,
        message: message || '',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await db.serviceVolunteers.create(volunteerData);

      return NextResponse.json({
        success: true,
        data: { message: 'Successfully volunteered for service request' }
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error processing service request:', error);
    return NextResponse.json(
      { error: 'Failed to process service request' },
      { status: 500 }
    );
  }
}