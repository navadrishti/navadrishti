import { db, supabase } from '@/lib/db';
import { resolveFundingTargetInr } from '@/lib/service-request-allocation';
import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_TYPES } from '@/lib/categories';
import { parseJsonObject } from '@/lib/utils';
import type { Json } from '@/lib/database.types';
import { parseAmount, parseImageArray } from './parsing';

export type CreateNeedBody = {
  title: string;
  description: string;
  category?: string;
  project_category?: string;
  request_type?: string;
  location?: string;
  timeline?: unknown;
  budget?: string | number;
  contactInfo?: string;
  estimated_budget?: string | number;
  beneficiary_count?: number | string;
  impact_description?: unknown;
  projectId?: string;
  project?: unknown;
  target_amount?: unknown;
  target_quantity?: unknown;
  current_amount?: unknown;
  current_quantity?: unknown;
  project_context?: unknown;
  details?: { [key: string]: Json | undefined };
  images?: unknown;
  volunteers_needed?: unknown;
  quantity?: unknown;
};

export type CreateNeedResult =
  | { ok: true; id: number }
  | { ok: false; status: 400; error: string };

type Urgency = 'low' | 'medium' | 'high' | 'critical';

const DAY_MS = 24 * 60 * 60 * 1000;

function fail(status: 400, error: string): CreateNeedResult {
  return { ok: false, status, error };
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
    day: DAY_MS,
    days: DAY_MS,
    week: 7 * DAY_MS,
    weeks: 7 * DAY_MS,
    month: 30 * DAY_MS,
    months: 30 * DAY_MS,
    year: 365 * DAY_MS,
    years: 365 * DAY_MS
  };

  return baseMs + (amount * (multiplierMap[unit] || multiplierMap.day));
}

function deriveAutoUrgency(timeline: unknown, createdAtMs: number): Urgency {
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

function buildProgressFields(body: Record<string, unknown>) {
  const resolvedTarget = resolveFundingTargetInr({
    funding_target_inr: body.funding_target_inr,
    target_amount: body.target_amount,
    estimated_budget: body.estimated_budget,
    budget: body.budget,
  });
  const targetAmount = resolvedTarget > 0 ? resolvedTarget : null;
  const targetQuantity = parseAmount(body.target_quantity ?? body.quantity ?? body.volunteers_needed ?? body.beneficiary_count);
  const currentAmount = parseAmount(body.current_amount) ?? 0;
  const currentQuantity = parseAmount(body.current_quantity) ?? 0;

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

/** Selected capability offers must all be active offers of the type matching the need. */
async function recommendedOffersAreValid(requestType: string, details: CreateNeedBody['details']): Promise<boolean> {
  const selectedRecommendedOfferIds: number[] = Array.isArray(details?.recommended_offer_ids)
    ? details.recommended_offer_ids
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isFinite(value) && value > 0)
    : [];

  const expectedOfferType = mapRequestTypeToOfferType(requestType);
  if (!expectedOfferType) return true;

  const { data: matchingOffers, error: matchingOffersError } = await supabase
    .from('service_offers')
    .select('id')
    .eq('offer_type', expectedOfferType)
    .eq('status', 'active')
    .limit(60);

  if (matchingOffersError) throw matchingOffersError;

  const offers = Array.isArray(matchingOffers) ? matchingOffers : [];

  if (selectedRecommendedOfferIds.length > 0) {
    const selectedOffers = offers.filter((offer) => selectedRecommendedOfferIds.includes(Number(offer.id)));
    return selectedOffers.length === selectedRecommendedOfferIds.length;
  }

  return true;
}

/** Validates and inserts a need for an NGO whose verification has already been confirmed. */
export async function createNeed(userId: number, body: CreateNeedBody): Promise<CreateNeedResult> {
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

  const normalizedRequestType = request_type;
  const normalizedProjectCategory = project_category || category;

  const missingRequiredFields = [title, description, location, timeline, budget, contactInfo, impact_description].some((value) => !String(value ?? '').trim());
  if (missingRequiredFields || !normalizedRequestType || !normalizedProjectCategory) {
    return fail(400, 'Missing required fields');
  }

  if (!beneficiary_count || Number(beneficiary_count) <= 0) {
    return fail(400, 'beneficiary_count must be greater than 0 (How many benefit?)');
  }

  if (!SERVICE_REQUEST_TYPES.includes(normalizedRequestType)) {
    return fail(400, 'Invalid request_type. Use one of Financial Need, Material Need, Skill / Service Need, Infrastructure Project.');
  }

  if (!CSR_SCHEDULE_VII_CATEGORIES.includes(normalizedProjectCategory)) {
    return fail(400, 'Invalid project_category. Select a valid Schedule VII category.');
  }

  if (projectId || project) {
    return fail(400, 'Needs are standalone. Create CSR projects via Post a Project; do not attach projectId when posting a need.');
  }

  const projectContext = {
    ...(parseJsonObject(project_context) || {}),
    project_category: normalizedProjectCategory,
    project: null
  };

  const trimmedTimeline = typeof timeline === 'string' ? timeline.trim() : '';
  if (trimmedTimeline.toLowerCase() === 'anytime') {
    return fail(400, 'Timeline cannot be "Anytime"; provide an actual duration or a date.');
  }
  const storedTimeline = trimmedTimeline || null;
  const timelineLabel = trimmedTimeline || 'Not specified';

  const mappedUrgency = deriveAutoUrgency(timeline, Date.now());

  if (!(await recommendedOffersAreValid(normalizedRequestType, details))) {
    return fail(400, 'One or more selected capability offers are invalid for this need.');
  }

  const images = parseImageArray(body.images);
  const fundingTargetInr = normalizedRequestType === 'Financial Need'
    ? resolveFundingTargetInr({
        target_amount,
        estimated_budget,
        budget,
      })
    : 0;
  const beneficiaryCount = Number(beneficiary_count ?? 0);

  const requirementsData = {
    request_type: normalizedRequestType,
    estimated_budget: estimated_budget || budget || 'Not specified',
    beneficiary_count: beneficiaryCount,
    impact_description: String(impact_description || '').trim(),
    budget: budget || estimated_budget || 'Not specified',
    contactInfo: contactInfo || 'Not specified',
    timeline: timelineLabel,
    project: projectContext,
    category_details: details || {},
    images,
    ...(fundingTargetInr > 0 ? { funding_target_inr: fundingTargetInr } : {}),
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

  const result = await db.serviceRequests.create({
    ngo_id: userId,
    title,
    description,
    category: normalizedProjectCategory,
    location: String(location).trim(),
    urgency_level: mappedUrgency,
    volunteers_needed: 1,
    tags: JSON.stringify([]),
    requirements: JSON.stringify(requirementsData),
    image_url: images[0] || null,
    status: 'active',
    request_type: normalizedRequestType,
    estimated_budget: parseFloat(String(estimated_budget || budget || '')) || null,
    beneficiary_count: beneficiaryCount,
    impact_description: String(impact_description || '').trim(),
    timeline: storedTimeline,
    contact_info: contactInfo || null,
    project_id: null,
    project_context: projectContext,
    ...progressFields
  });

  return { ok: true, id: result.id };
}
