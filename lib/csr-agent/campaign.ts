import { supabase } from "@/lib/db";
import { z } from "zod";
import Razorpay from "razorpay";
import { emailService } from "@/lib/email";
import { createPlatformPricedOrder } from "@/lib/razorpay-route";
import { getDelhiveryTrackingSnapshot, createDelhiveryShipment, type DelhiveryTrackingSnapshot } from "@/lib/delhivery";
import {
  isDeliveredTrackingStatus,
  isPickedUpTrackingStatus,
} from "@/lib/service-request-allocation";
import {
  addDaysIso,
  buildAssignmentMeta,
  buildCsrDeliveryLocation,
  CSR_FINE_CLEARANCE_DAYS,
  CSR_OUTBOUND_DISPATCH_DAYS,
  CSR_RETURN_DISPATCH_DAYS,
  parseCsrCapabilityRentals,
  parseImpactMetrics,
  rentalRecordKey,
  resolveCsrRentalAmountInr,
  resolveMaterialTotalWorthInr,
  shouldUseDelhiveryForCsrCapabilityRental,
  upsertCsrCapabilityRental,
  accrueCsrFine,
  type CsrCapabilityDeliveryLeg,
  type CsrCapabilityRentalRecord,
} from "@/lib/service-engagement";

// ----------- Schemas -----------

function coerceInteger(schema: z.ZodNumber) {
  return z.preprocess((value) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? Math.round(value) : value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.round(parsed) : value;
    }

    return value;
  }, schema);
}

const CampaignDraftSchema = z.object({
  title:            z.string().min(1),
  description:      z.string().min(1),
  category:         z.string().min(1),
  location:         z.string().min(1),
  budget_inr:       coerceInteger(z.number().int().nonnegative()),
  budget_breakdown: z.record(z.number()),
  schedule_vii:     z.string().min(1),
  sdg_alignment:    z.array(coerceInteger(z.number().int().positive())),
  start_date:       z.string(),
  end_date:         z.string(),
  impact_metrics: z.object({
    beneficiaries: coerceInteger(z.number().int().nonnegative()),
    duration:      z.string(),
  }),
  milestones: z.array(
    z.object({
      title:            z.string(),
      description:      z.string(),
      duration_weeks:   coerceInteger(z.number().int().nonnegative()),
      budget_allocated: z.number(),
      deliverables:     z.array(z.string()),
    })
  ),
});

export const SelectedCampaignInSchema = z.object({
  campaign:   CampaignDraftSchema,
  company_id: z.number().int(),
});

export const UpdateSelectedCampaignSchema = z.object({
  campaign:    CampaignDraftSchema.partial().optional(),
  company_id:  z.number().int(),
  campaign_id: z.string().uuid(),
});

// ----------- Service Functions -----------

export async function getCampaignStatus(id: string, company_id: number) {
  const { data } = await supabase
    .from("campaigns")
    .select("status")
    .eq("id", id)
    .eq("company_id", company_id)
    .single();
  return data?.status || null;
}

export async function insertCampaignDb(data: z.infer<typeof SelectedCampaignInSchema>) {
  const { data: inserted, error } = await supabase
    .from("campaigns")
    .insert({
      ...data.campaign,
      company_id: data.company_id,
      status: "draft"
    })
    .select("id, title, status")
    .single();

  // Fix 1: Null safety on insertion
  if (error || !inserted) {
    throw new Error(error?.message || "Insert failed");
  }
  return inserted;
}

export async function updateCampaignDb(
  id: string, 
  company_id: number, 
  updates: Partial<z.infer<typeof CampaignDraftSchema>> // Fix 3: Proper typing
) {
  const { data, error } = await supabase
    .from("campaigns")
    .update(updates)
    .eq("id", id)
    .eq("company_id", company_id)
    .select("id, title, status")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Update failed");
  }
  return data;
}

async function loadCompanyCampaign(campaignId: string, companyId: number) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("company_id", companyId)
    .single();
  if (error || !data) throw new Error("Campaign not found");
  return data;
}

async function saveCampaignRentals(campaignId: string, companyId: number, rentals: CsrCapabilityRentalRecord[]) {
  const campaign = await loadCompanyCampaign(campaignId, companyId);
  const impact = parseImpactMetrics(campaign.impact_metrics);
  const { error } = await supabase
    .from("campaigns")
    .update({
      impact_metrics: {
        ...impact,
        csr_capability_rentals: rentals,
      },
    })
    .eq("id", campaignId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message || "Failed to save CSR capability rentals");
}

export async function getCsrCapabilityRentals(campaignId: string, companyId: number) {
  const campaign = await loadCompanyCampaign(campaignId, companyId);
  return parseCsrCapabilityRentals(campaign.impact_metrics);
}

export async function ensureCsrCapabilityRentalDraft(input: {
  campaignId: string;
  companyId: number;
  offerId: number;
}) {
  const [campaign, offerResult] = await Promise.all([
    loadCompanyCampaign(input.campaignId, input.companyId),
    supabase.from("service_offers").select("*").eq("id", input.offerId).single(),
  ]);
  const offer = offerResult.data;
  if (offerResult.error || !offer) throw new Error("Capability offer not found");

  const rentals = parseCsrCapabilityRentals(campaign.impact_metrics);
  const id = rentalRecordKey(input.campaignId, input.offerId);
  const existing = rentals.find((row) => row.id === id);
  if (existing?.payment_status === "paid") return existing;

  const leadNgoId = Number(parseImpactMetrics(campaign.impact_metrics).selected_lead_ngo_id || 0) || null;
  const draft: CsrCapabilityRentalRecord = {
    id,
    campaign_id: input.campaignId,
    service_offer_id: input.offerId,
    company_user_id: input.companyId,
    provider_user_id: Number(offer.creator_id || 0),
    lead_ngo_user_id: leadNgoId,
    offer_type: String(offer.offer_type || "material"),
    material_total_worth_inr: resolveMaterialTotalWorthInr(offer),
    rental_amount_inr: resolveCsrRentalAmountInr(offer),
    status: "pending_payment",
    payment_status: "pending",
    delivery_location: buildCsrDeliveryLocation(campaign),
    fine: { base_amount_inr: 0, accrued_fine_inr: 0, pending_total_inr: 0, status: "none" },
  };

  const nextRentals = upsertCsrCapabilityRental(rentals, existing ? { ...existing, ...draft } : draft);
  await saveCampaignRentals(input.campaignId, input.companyId, nextRentals);
  return nextRentals.find((row) => row.id === id)!;
}

export async function createCsrCapabilityRentalOrder(input: {
  campaignId: string;
  companyId: number;
  offerId: number;
}) {
  const rental = await ensureCsrCapabilityRentalDraft(input);
  if (rental.payment_status === "paid") {
    return { paymentRequired: false, rental };
  }

  const baseAmountInr = rental.rental_amount_inr;
  if (baseAmountInr <= 0) {
    throw new Error("This capability does not have a rental rate configured.");
  }

  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured");

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const { order, pricing } = await createPlatformPricedOrder({
    razorpay,
    baseAmountInr,
    receipt: `csr_cap_${input.offerId}_${Date.now()}`,
    paymentKind: "csr_capability_rental",
    beneficiaryUserId: rental.provider_user_id,
    notes: {
      campaign_id: input.campaignId,
      service_offer_id: String(input.offerId),
      target_type: "csr_capability_rental",
      payer_user_id: String(input.companyId),
    },
  });

  const rentals = await getCsrCapabilityRentals(input.campaignId, input.companyId);
  const updated = upsertCsrCapabilityRental(rentals, {
    ...rental,
    razorpay_order_id: order.id,
  });
  await saveCampaignRentals(input.campaignId, input.companyId, updated);

  return {
    paymentRequired: true,
    keyId,
    orderId: order.id,
    amount: pricing.totalChargeInr,
    baseAmountInr,
    pricing,
    rental: updated.find((row) => row.id === rental.id),
  };
}

export async function attachCsrCapabilityAfterPayment(input: {
  campaignId: string;
  companyId: number;
  offerId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
}) {
  const [campaign, offerResult] = await Promise.all([
    loadCompanyCampaign(input.campaignId, input.companyId),
    supabase.from("service_offers").select("*").eq("id", input.offerId).single(),
  ]);
  const offer = offerResult.data;
  if (!offer) throw new Error("Capability offer not found");

  const rentals = parseCsrCapabilityRentals(campaign.impact_metrics);
  const id = rentalRecordKey(input.campaignId, input.offerId);
  const rental = rentals.find((row) => row.id === id);
  if (!rental) throw new Error("CSR capability rental record not found");
  if (rental.payment_status === "paid") return rental;

  const paidAt = new Date().toISOString();
  const leadNgoId = Number(parseImpactMetrics(campaign.impact_metrics).selected_lead_ngo_id || 0) || null;

  const { data: clientRow, error: clientError } = await supabase
    .from("service_clients")
    .insert({
      service_offer_id: input.offerId,
      client_id: leadNgoId || input.companyId,
      message: `CSR project rental for campaign ${campaign.title || input.campaignId}`,
      status: "accepted",
      accepted_at: paidAt,
      assigned_at: paidAt,
      response_meta: {
        flow: "csr_capability_rental",
        campaign_id: input.campaignId,
        company_user_id: input.companyId,
        payment_status: "paid",
        payment_amount_inr: rental.rental_amount_inr,
        material_total_worth_inr: rental.material_total_worth_inr,
        outbound_dispatch_due_at: addDaysIso(paidAt, CSR_OUTBOUND_DISPATCH_DAYS),
        delivery_location: rental.delivery_location,
      },
    })
    .select("*")
    .single();

  if (clientError || !clientRow) {
    throw new Error(clientError?.message || "Failed to attach capability after payment");
  }

  const assignmentMeta = buildAssignmentMeta({
    targetType: "csr_project",
    targetId: input.campaignId,
    serviceOfferId: input.offerId,
    csrProjectId: rental.csr_project_id || null,
    ownerUserId: Number(offer.creator_id || 0),
    assigneeUserId: leadNgoId || input.companyId,
    assignedByUserId: input.companyId,
    billingCycle: "daily",
    paymentMode: "daily_due",
    ratePerUnit: rental.rental_amount_inr,
    amount: rental.rental_amount_inr,
    currency: "INR",
    applicationTable: "service_clients",
    applicationId: clientRow.id,
  });

  const { data: assignment } = await supabase
    .from("service_engagement_assignments")
    .insert({
      ...assignmentMeta,
      status: "active",
      meta: {
        ...assignmentMeta,
        flow: "csr_capability_rental",
        campaign_id: input.campaignId,
        material_total_worth_inr: rental.material_total_worth_inr,
        outbound_dispatch_due_at: addDaysIso(paidAt, CSR_OUTBOUND_DISPATCH_DAYS),
        delivery_location: rental.delivery_location,
      },
    })
    .select("id")
    .single();

  const offerDetails =
    offer.offer_details && typeof offer.offer_details === "object" ? offer.offer_details : {};
  await supabase
    .from("service_offers")
    .update({
      status: "inactive",
      offer_details: {
        ...offerDetails,
        csr_rental_lock: {
          campaign_id: input.campaignId,
          company_user_id: input.companyId,
          paid_at: paidAt,
        },
      },
    })
    .eq("id", input.offerId);

  const impact = parseImpactMetrics(campaign.impact_metrics);
  const invited = Array.isArray(impact.invited_offer_ids) ? impact.invited_offer_ids.map(Number) : [];
  const invitedOfferIds = invited.includes(input.offerId) ? invited : [...invited, input.offerId];

  const paidRental: CsrCapabilityRentalRecord = {
    ...rental,
    status: "attached",
    payment_status: "paid",
    paid_at: paidAt,
    razorpay_order_id: input.razorpayOrderId,
    razorpay_payment_id: input.razorpayPaymentId,
    outbound_dispatch_due_at: addDaysIso(paidAt, CSR_OUTBOUND_DISPATCH_DAYS),
    logistics_provider: shouldUseDelhiveryForCsrCapabilityRental(rental) ? "delhivery" : null,
    service_client_id: Number(clientRow.id),
    assignment_id: assignment?.id ? String(assignment.id) : null,
    lead_ngo_user_id: leadNgoId,
  };

  await supabase
    .from("campaigns")
    .update({
      impact_metrics: {
        ...impact,
        invited_offer_ids: invitedOfferIds,
        csr_capability_rentals: upsertCsrCapabilityRental(rentals, paidRental),
      },
    })
    .eq("id", input.campaignId)
    .eq("company_id", input.companyId);

  if (shouldUseDelhiveryForCsrCapabilityRental(paidRental)) {
    return autoBookCsrCapabilityDelhivery({
      campaignId: input.campaignId,
      offerId: input.offerId,
      leg: "outbound",
      bookedByUserId: Number(rental.provider_user_id || offer.creator_id || 0),
      companyId: input.companyId,
    });
  }

  return paidRental;
}

export async function updateCsrCapabilityRentalStatus(input: {
  campaignId: string;
  offerId: number;
  companyId?: number;
  patch: Partial<CsrCapabilityRentalRecord>;
}) {
  let query = supabase.from("campaigns").select("*").eq("id", input.campaignId);
  if (input.companyId) query = query.eq("company_id", input.companyId);
  const { data: campaign, error } = await query.single();
  if (error || !campaign) throw new Error("Campaign not found");

  const rentals = parseCsrCapabilityRentals(campaign.impact_metrics);
  const id = rentalRecordKey(input.campaignId, input.offerId);
  const current = rentals.find((row) => row.id === id);
  if (!current) throw new Error("CSR capability rental not found");

  const next = upsertCsrCapabilityRental(rentals, { ...current, ...input.patch, id });
  const impact = parseImpactMetrics(campaign.impact_metrics);
  await supabase
    .from("campaigns")
    .update({ impact_metrics: { ...impact, csr_capability_rentals: next } })
    .eq("id", input.campaignId);

  return next.find((row) => row.id === id)!;
}

export async function verifyPaidCsrOffersForPublish(campaignId: string, companyId: number) {
  const campaign = await loadCompanyCampaign(campaignId, companyId);
  const impact = parseImpactMetrics(campaign.impact_metrics);
  const invitedIds = Array.isArray(impact.invited_offer_ids)
    ? impact.invited_offer_ids.map(Number).filter((id) => id > 0)
    : [];
  const rentals = parseCsrCapabilityRentals(campaign.impact_metrics);
  const unpaid = invitedIds.filter((offerId) => {
    const rental = rentals.find((row) => Number(row.service_offer_id) === offerId);
    return !rental || rental.payment_status !== "paid";
  });
  if (unpaid.length > 0) {
    throw new Error(
      `Pay and reserve all invited capabilities before publishing. Unpaid offer IDs: ${unpaid.join(", ")}`
    );
  }
}

export async function processCsrCapabilityDailyCompliance() {
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, company_id, title, impact_metrics, end_date, status")
    .not("impact_metrics", "is", null);

  const now = new Date();
  let refunds = 0;
  let fines = 0;
  let reminders = 0;
  let suspended = 0;

  for (const campaign of campaigns || []) {
    let rentals = parseCsrCapabilityRentals(campaign.impact_metrics);
    if (rentals.length === 0) continue;

    let changed = false;
    rentals = rentals.map((rental) =>
      applyCsrRentalDailyCompliance(rental, now, {
        onRefund: () => {
          refunds += 1;
        },
        onFine: () => {
          fines += 1;
        },
        onReminder: () => {
          reminders += 1;
        },
        markChanged: () => {
          changed = true;
        },
      })
    );

    if (changed) {
      const impact = parseImpactMetrics(campaign.impact_metrics);
      await supabase
        .from("campaigns")
        .update({ impact_metrics: { ...impact, csr_capability_rentals: rentals } })
        .eq("id", campaign.id);

      for (const rental of rentals) {
        if (rental.fine?.status === "overdue" && rental.fine.due_cleared_by) {
          const overdueMs = now.getTime() - new Date(rental.fine.due_cleared_by).getTime();
          if (overdueMs > CSR_FINE_CLEARANCE_DAYS * 24 * 60 * 60 * 1000) {
            const { data: companyUser } = await supabase
              .from("users")
              .select("id, email, name, profile_data, verification_status")
              .eq("id", rental.company_user_id)
              .single();
            if (companyUser && companyUser.verification_status !== "suspended") {
              const profile = parseImpactMetrics(companyUser.profile_data);
              await supabase
                .from("users")
                .update({
                  verification_status: "suspended",
                  profile_data: {
                    ...profile,
                    csr_capability_account: {
                      status: "suspended",
                      suspended_at: now.toISOString(),
                      reason: "CSR capability rental fine not cleared within 10 days",
                    },
                  },
                })
                .eq("id", rental.company_user_id);
              suspended += 1;
              if (companyUser.email) {
                await emailService.sendEmail({
                  to: companyUser.email,
                  subject: "Navadrishti account suspended — CSR capability penalty overdue",
                  html: `<p>Your company account has been suspended because an outstanding CSR capability penalty was not cleared within ${CSR_FINE_CLEARANCE_DAYS} days.</p>`,
                  text: `Your company account has been suspended because an outstanding CSR capability penalty was not cleared within ${CSR_FINE_CLEARANCE_DAYS} days.`,
                });
              }
            }
          }
        }
      }
    }
  }

  return { refunds, fines, reminders, suspended };
}

function applyCsrRentalDailyCompliance(
  rental: CsrCapabilityRentalRecord,
  now: Date,
  hooks: {
    onRefund: () => void;
    onFine: () => void;
    onReminder: () => void;
    markChanged: () => void;
  }
): CsrCapabilityRentalRecord {
  let next = rental;

  if (
    ["paid", "attached", "outbound_dispatched"].includes(rental.status) &&
    rental.outbound_dispatch_due_at &&
    !rental.outbound_delivered_at &&
    !rental.outbound_dispatched_at &&
    !isPickedUpTrackingStatus(rental.outbound_delivery?.last_status) &&
    now.getTime() > new Date(rental.outbound_dispatch_due_at).getTime()
  ) {
    next = { ...next, status: "refunded", payment_status: "refunded" };
    hooks.markChanged();
    hooks.onRefund();
    scheduleCsrOutboundRefund(rental);
  }

  if (
    rental.status === "return_pending" &&
    rental.return_dispatch_due_at &&
    !rental.return_delivered_at &&
    now.getTime() > new Date(rental.return_dispatch_due_at).getTime() &&
    String(rental.offer_type || "").toLowerCase() === "material"
  ) {
    const base = rental.material_total_worth_inr || rental.rental_amount_inr || 0;
    next = {
      ...next,
      fine: {
        base_amount_inr: base,
        accrued_fine_inr: Number(rental.fine?.accrued_fine_inr || 0),
        pending_total_inr: Number(rental.fine?.pending_total_inr || base),
        due_cleared_by:
          rental.fine?.due_cleared_by || addDaysIso(rental.return_dispatch_due_at, CSR_FINE_CLEARANCE_DAYS),
        status: "pending",
        reason: "Return dispatch to capability owner not completed within 2 days",
        created_at: rental.fine?.created_at || now.toISOString(),
      },
    };
    hooks.markChanged();
  }

  if (rental.fine && ["pending", "overdue"].includes(rental.fine.status)) {
    const accrued = accrueCsrFine(rental, now);
    if (accrued.fine?.pending_total_inr !== rental.fine.pending_total_inr) {
      next = accrued;
      hooks.markChanged();
      hooks.onFine();
    }

    const due = rental.fine.due_cleared_by ? new Date(rental.fine.due_cleared_by) : null;
    if (due && now.getTime() > due.getTime()) {
      next = {
        ...next,
        fine: {
          ...(next.fine || rental.fine),
          status: "overdue",
        },
      };
      hooks.markChanged();
    }
  }

  const lastReminder = rental.reminders?.last_sent_at ? new Date(rental.reminders.last_sent_at) : null;
  const shouldRemind =
    !lastReminder || now.getTime() - lastReminder.getTime() >= 24 * 60 * 60 * 1000;
  if (shouldRemind && (next.fine?.status === "pending" || next.fine?.status === "overdue")) {
    next = {
      ...next,
      reminders: {
        last_sent_at: now.toISOString(),
        count: Number(rental.reminders?.count || 0) + 1,
      },
    };
    hooks.markChanged();
    hooks.onReminder();
    void sendCsrFineReminder(rental.company_user_id, Number(next.fine?.pending_total_inr || 0));
  }

  return next;
}

function scheduleCsrOutboundRefund(rental: CsrCapabilityRentalRecord) {
  if (!rental.razorpay_payment_id || !process.env.RAZORPAY_KEY_SECRET || !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
    return;
  }

  void (async () => {
    try {
      const razorpay = new Razorpay({
        key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_KEY_SECRET!,
      });
      await razorpay.payments.refund(String(rental.razorpay_payment_id), {
        amount: Math.round(Number(rental.rental_amount_inr || 0) * 100),
        notes: { reason: "csr_outbound_dispatch_sla_missed" },
      });

      const { data: offerRow } = await supabase
        .from("service_offers")
        .select("offer_details")
        .eq("id", rental.service_offer_id)
        .single();

      const details =
        offerRow?.offer_details && typeof offerRow.offer_details === "object"
          ? (offerRow.offer_details as Record<string, unknown>)
          : {};
      const { csr_rental_lock: _removed, ...restDetails } = details as Record<string, unknown> & {
        csr_rental_lock?: unknown;
      };

      await supabase
        .from("service_offers")
        .update({ status: "active", offer_details: restDetails })
        .eq("id", rental.service_offer_id);
    } catch (refundError) {
      console.error("CSR capability outbound refund failed:", refundError);
    }
  })();
}

async function sendCsrFineReminder(companyUserId: number, pendingTotalInr: number) {
  const { data: companyUser } = await supabase
    .from("users")
    .select("email, name")
    .eq("id", companyUserId)
    .single();

  if (!companyUser?.email) return;

  await emailService.sendEmail({
    to: companyUser.email,
    subject: "Reminder: CSR capability penalty pending on Navadrishti",
    html: `<p>Daily reminder: an outstanding CSR capability penalty of INR ${pendingTotalInr.toLocaleString("en-IN")} is pending. Unpaid balances accrue 2% daily. Clear within 10 days to avoid account suspension.</p>`,
    text: `Daily reminder: CSR capability penalty INR ${pendingTotalInr.toLocaleString("en-IN")} is pending.`,
  });
}

export async function markCsrProjectCompleted(input: {
  campaignId: string;
  completedAt?: string;
}) {
  const completedAt = input.completedAt || new Date().toISOString();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", input.campaignId)
    .single();
  if (!campaign) throw new Error("Campaign not found");

  const rentals = parseCsrCapabilityRentals(campaign.impact_metrics).map((rental) => {
    if (rental.payment_status !== "paid" || rental.status === "completed") return rental;
    const isMaterial = String(rental.offer_type || "").toLowerCase() === "material";
    const returnDue = addDaysIso(completedAt, CSR_RETURN_DISPATCH_DAYS);
    return {
      ...rental,
      status: "return_pending" as const,
      project_completed_at: completedAt,
      return_dispatch_due_at: returnDue,
      fine: isMaterial
        ? {
            base_amount_inr: rental.material_total_worth_inr,
            accrued_fine_inr: 0,
            pending_total_inr: rental.material_total_worth_inr,
            last_accrual_at: null,
            due_cleared_by: addDaysIso(completedAt, CSR_FINE_CLEARANCE_DAYS),
            status: "pending" as const,
            reason: "Return dispatch not completed within 2 days of CSR project completion",
            created_at: completedAt,
          }
        : rental.fine,
    };
  });

  const impact = parseImpactMetrics(campaign.impact_metrics);
  await supabase
    .from("campaigns")
    .update({ impact_metrics: { ...impact, csr_capability_rentals: rentals } })
    .eq("id", input.campaignId);

  for (const rental of rentals) {
    if (rental.status !== "return_pending") continue;
    if (!shouldUseDelhiveryForCsrCapabilityRental(rental)) continue;
    if (String(rental.return_delivery?.tracking_id || "").trim()) continue;

    const leadId = Number(rental.lead_ngo_user_id || 0);
    if (leadId <= 0) continue;

    await autoBookCsrCapabilityDelhivery({
      campaignId: input.campaignId,
      offerId: Number(rental.service_offer_id),
      leg: "return",
      bookedByUserId: leadId,
      companyId: Number(campaign.company_id || 0) || undefined,
    });
  }
}

export async function fetchCompanyCsrCapabilityFines(companyId: number) {
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, title, impact_metrics")
    .eq("company_id", companyId);

  const fines: Array<Record<string, unknown>> = [];
  for (const campaign of campaigns || []) {
    const rentals = parseCsrCapabilityRentals(campaign.impact_metrics);
    for (const rental of rentals) {
      if (!rental.fine || !["pending", "overdue", "suspended"].includes(rental.fine.status)) continue;
      fines.push({
        campaign_id: campaign.id,
        campaign_title: campaign.title,
        service_offer_id: rental.service_offer_id,
        material_total_worth_inr: rental.material_total_worth_inr,
        base_amount_inr: rental.fine.base_amount_inr,
        accrued_fine_inr: rental.fine.accrued_fine_inr,
        pending_total_inr: rental.fine.pending_total_inr,
        due_cleared_by: rental.fine.due_cleared_by,
        status: rental.fine.status,
        reason: rental.fine.reason,
      });
    }
  }
  return fines;
}

export type CsrCapabilityRentalDeliveryRole = "company" | "lead_ngo" | "provider";

export type CsrCapabilityRentalDeliveryView = {
  campaign_id: string;
  campaign_title: string | null;
  campaign_status: string | null;
  company_id: number;
  role: CsrCapabilityRentalDeliveryRole;
  rental: CsrCapabilityRentalRecord;
  offer_title?: string | null;
};

function buildDeliveryLegFromSnapshot(snapshot: DelhiveryTrackingSnapshot): CsrCapabilityDeliveryLeg {
  return {
    provider: "delhivery",
    tracking_id: snapshot.trackingId,
    last_status: snapshot.currentStatus,
    last_location: snapshot.lastLocation,
    last_event_at: snapshot.lastEventAt,
    synced_at: new Date().toISOString(),
    events: snapshot.events.slice(0, 20),
  };
}

function resolveCsrDeliveryRole(
  userId: number,
  rental: CsrCapabilityRentalRecord
): CsrCapabilityRentalDeliveryRole | null {
  if (Number(rental.company_user_id) === userId) return "company";
  if (Number(rental.lead_ngo_user_id || 0) === userId) return "lead_ngo";
  if (Number(rental.provider_user_id) === userId) return "provider";
  return null;
}

export function assertCsrCapabilityDeliveryAccess(input: {
  userId: number;
  rental: CsrCapabilityRentalRecord;
  leg: "outbound" | "return";
}) {
  const role = resolveCsrDeliveryRole(input.userId, input.rental);
  if (!role) throw new Error("Insufficient permissions");

  if (input.leg === "outbound") {
    if (role === "provider" || role === "company") return;
    throw new Error("Only the capability owner or company can manage outbound Delhivery tracking");
  }

  if (role === "lead_ngo" || role === "company") return;
  throw new Error("Only the lead NGO or company can manage return Delhivery tracking");
}

export function canEditCsrCapabilityTrackingId(input: {
  userId: number;
  rental: CsrCapabilityRentalRecord;
  leg: "outbound" | "return";
}): boolean {
  const role = resolveCsrDeliveryRole(input.userId, input.rental);
  if (!role) return false;
  if (input.leg === "outbound") return role === "provider";
  return role === "lead_ngo";
}

export async function loadCampaignRentalByOffer(campaignId: string, offerId: number) {
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (error || !campaign) throw new Error("Campaign not found");

  const rentals = parseCsrCapabilityRentals(campaign.impact_metrics);
  const rental = rentals.find((row) => Number(row.service_offer_id) === offerId);
  if (!rental) throw new Error("CSR capability rental not found");

  return { campaign, rental };
}

function applyDelhiverySnapshotToRental(
  rental: CsrCapabilityRentalRecord,
  leg: "outbound" | "return",
  snapshot: DelhiveryTrackingSnapshot,
  campaignStatus?: string | null
): Partial<CsrCapabilityRentalRecord> {
  const legMeta = buildDeliveryLegFromSnapshot(snapshot);
  const eventAt = snapshot.lastEventAt || new Date().toISOString();
  const patch: Partial<CsrCapabilityRentalRecord> =
    leg === "outbound" ? { outbound_delivery: legMeta } : { return_delivery: legMeta };

  if (leg === "outbound") {
    if (isPickedUpTrackingStatus(snapshot.currentStatus)) {
      patch.outbound_dispatched_at = rental.outbound_dispatched_at || eventAt;
      if (["paid", "attached"].includes(rental.status)) {
        patch.status = "outbound_dispatched";
      }
    }
    if (isDeliveredTrackingStatus(snapshot.currentStatus)) {
      patch.outbound_delivered_at = eventAt;
      patch.status = String(campaignStatus || "").toLowerCase() === "active" ? "project_active" : "outbound_delivered";
    }
    return patch;
  }

  if (isPickedUpTrackingStatus(snapshot.currentStatus)) {
    patch.return_dispatched_at = rental.return_dispatched_at || eventAt;
  }
  if (isDeliveredTrackingStatus(snapshot.currentStatus)) {
    patch.return_delivered_at = eventAt;
    patch.status = "return_delivered";
    patch.fine = {
      base_amount_inr: 0,
      accrued_fine_inr: 0,
      pending_total_inr: 0,
      status: "cleared",
      reason: "Return delivered via Delhivery",
    };
  }
  return patch;
}

export async function linkCsrCapabilityRentalTracking(input: {
  campaignId: string;
  offerId: number;
  leg: "outbound" | "return";
  trackingId: string;
}) {
  const { campaign, rental } = await loadCampaignRentalByOffer(input.campaignId, input.offerId);
  if (!shouldUseDelhiveryForCsrCapabilityRental(rental)) {
    throw new Error("Delhivery tracking applies to material capability rentals only");
  }

  const trackingId = String(input.trackingId || "").trim();
  if (!trackingId) throw new Error("Delhivery tracking ID is required");

  const legPatch =
    input.leg === "outbound"
      ? {
          outbound_delivery: {
            ...(rental.outbound_delivery || {}),
            provider: "delhivery" as const,
            tracking_id: trackingId,
          },
        }
      : {
          return_delivery: {
            ...(rental.return_delivery || {}),
            provider: "delhivery" as const,
            tracking_id: trackingId,
          },
        };

  return updateCsrCapabilityRentalStatus({
    campaignId: input.campaignId,
    offerId: input.offerId,
    companyId: Number(campaign.company_id || 0) || undefined,
    patch: {
      logistics_provider: "delhivery",
      ...legPatch,
    },
  });
}

export async function syncCsrCapabilityRentalDelhivery(input: {
  campaignId: string;
  offerId: number;
  leg: "outbound" | "return";
  trackingId?: string;
}) {
  const { campaign, rental } = await loadCampaignRentalByOffer(input.campaignId, input.offerId);
  if (!shouldUseDelhiveryForCsrCapabilityRental(rental)) {
    throw new Error("Delhivery tracking applies to material capability rentals only");
  }

  const existingLeg = input.leg === "outbound" ? rental.outbound_delivery : rental.return_delivery;
  const trackingId = String(input.trackingId || existingLeg?.tracking_id || "").trim();
  if (!trackingId) throw new Error("Delhivery tracking ID is required");

  const snapshot = await getDelhiveryTrackingSnapshot(trackingId);
  const patch = applyDelhiverySnapshotToRental(rental, input.leg, snapshot, campaign.status);

  return updateCsrCapabilityRentalStatus({
    campaignId: input.campaignId,
    offerId: input.offerId,
    companyId: Number(campaign.company_id || 0) || undefined,
    patch: {
      logistics_provider: "delhivery",
      ...patch,
    },
  });
}

type CsrShippingAddress = {
  name: string;
  phone: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
};

async function loadUserShippingAddress(userId: number): Promise<CsrShippingAddress> {
  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, phone, city, state_province, pincode, location, profile_data")
    .eq("id", userId)
    .single();

  if (error || !user) throw new Error("User profile not found for Delhivery booking");

  const profile = parseImpactMetrics(user.profile_data);
  const phone = String(user.phone || profile.phone || "").replace(/\D/g, "");
  const pincode = String(user.pincode || profile.pincode || "").replace(/\D/g, "").slice(0, 6);

  if (phone.length < 10) {
    throw new Error("Add a valid phone number on the NGO profile before booking Delhivery");
  }
  if (pincode.length !== 6) {
    throw new Error("Add a valid 6-digit pincode on the NGO profile before booking Delhivery");
  }

  const addressLine = String(user.location || profile.address || profile.location || "").trim();
  if (!addressLine) {
    throw new Error("Add a pickup/delivery address on the NGO profile before booking Delhivery");
  }

  return {
    name: String(user.name || profile.organization_name || "Navadrishti NGO").trim(),
    phone,
    addressLine,
    city: String(user.city || profile.city || "").trim() || "NA",
    state: String(user.state_province || profile.state || profile.state_province || "").trim() || "NA",
    pincode,
  };
}

async function loadOfferPickupAddress(offer: Record<string, unknown>): Promise<CsrShippingAddress> {
  const providerId = Number(offer.creator_id || 0);
  const base = await loadUserShippingAddress(providerId);
  const details =
    offer.offer_details && typeof offer.offer_details === "object"
      ? (offer.offer_details as Record<string, unknown>)
      : {};

  return {
    ...base,
    name: String(offer.title || base.name).trim(),
    addressLine:
      String(offer.coverage_area || offer.location || details.pickup_address || base.addressLine).trim() ||
      base.addressLine,
    city: String(offer.city || base.city).trim() || base.city,
    state: String(offer.state_province || base.state).trim() || base.state,
    pincode: String(offer.pincode || base.pincode).replace(/\D/g, "").slice(0, 6) || base.pincode,
  };
}

async function loadCampaignDropAddress(
  campaign: Record<string, unknown>,
  leadNgoUserId: number | null
): Promise<CsrShippingAddress> {
  const delivery = buildCsrDeliveryLocation(campaign);
  const leadId = Number(leadNgoUserId || 0);
  const leadAddress = leadId > 0 ? await loadUserShippingAddress(leadId) : null;

  const pincode = String(delivery?.pincode || leadAddress?.pincode || "")
    .replace(/\D/g, "")
    .slice(0, 6);
  if (pincode.length !== 6) {
    throw new Error("CSR campaign delivery pincode is missing. Set campaign location pincode before booking Delhivery");
  }

  const addressLine = String(delivery?.location || leadAddress?.addressLine || "").trim();
  if (!addressLine) {
    throw new Error("CSR campaign delivery address is missing. Set campaign location before booking Delhivery");
  }

  return {
    name: leadAddress?.name || String(campaign.title || "CSR project site").trim(),
    phone: leadAddress?.phone || "",
    addressLine,
    city: String(delivery?.city || leadAddress?.city || "").trim() || "NA",
    state: String(delivery?.state || leadAddress?.state || "").trim() || "NA",
    pincode,
  };
}

function resolveDelhiveryPickupLocationName(userId: number, profileData: unknown): string {
  const profile = parseImpactMetrics(profileData);
  const fromProfile = String(profile.delhivery_pickup_location || "").trim();
  const fromEnv = String(process.env.DELHIVERY_PICKUP_LOCATION_NAME || "").trim();
  if (fromProfile) return fromProfile;
  if (fromEnv) return fromEnv;
  throw new Error(
    "Delhivery pickup warehouse is not configured. Set DELHIVERY_PICKUP_LOCATION_NAME or profile delhivery_pickup_location"
  );
}

function estimateOfferWeightGrams(offer: Record<string, unknown>): number {
  const details =
    offer.offer_details && typeof offer.offer_details === "object"
      ? (offer.offer_details as Record<string, unknown>)
      : {};
  const quantity = Number(details.quantity || 1);
  const perUnit = Number(details.weight_grams || details.weight || 500);
  const total = Math.round(Math.max(1, quantity) * Math.max(100, perUnit));
  return Number.isFinite(total) ? total : 500;
}

async function recordCsrDeliveryBookingFailure(input: {
  campaignId: string;
  offerId: number;
  leg: "outbound" | "return";
  companyId?: number;
  message: string;
}) {
  const legKey = input.leg === "outbound" ? "outbound_delivery" : "return_delivery";
  return updateCsrCapabilityRentalStatus({
    campaignId: input.campaignId,
    offerId: input.offerId,
    companyId: input.companyId,
    patch: {
      logistics_provider: "delhivery",
      [legKey]: {
        provider: "delhivery",
        booking_error: input.message,
        booking_attempted_at: new Date().toISOString(),
      },
    } as Partial<CsrCapabilityRentalRecord>,
  });
}

export async function autoBookCsrCapabilityDelhivery(input: {
  campaignId: string;
  offerId: number;
  leg: "outbound" | "return";
  bookedByUserId: number;
  companyId?: number;
}): Promise<CsrCapabilityRentalRecord> {
  const { rental } = await loadCampaignRentalByOffer(input.campaignId, input.offerId);
  if (!shouldUseDelhiveryForCsrCapabilityRental(rental)) {
    return rental;
  }

  if (!Number.isFinite(input.bookedByUserId) || input.bookedByUserId <= 0) {
    return recordCsrDeliveryBookingFailure({
      ...input,
      message: "Profile missing for automatic Delhivery booking",
    });
  }

  try {
    return await bookCsrCapabilityRentalDelhivery(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delhivery booking failed";
    console.error("Automatic CSR Delhivery booking failed:", {
      campaignId: input.campaignId,
      offerId: input.offerId,
      leg: input.leg,
      message,
    });
    return recordCsrDeliveryBookingFailure({ ...input, message });
  }
}

export async function retryCsrCapabilityDelhiveryBooking(input: {
  campaignId: string;
  offerId: number;
  leg: "outbound" | "return";
  bookedByUserId: number;
  companyId?: number;
}) {
  const { rental } = await loadCampaignRentalByOffer(input.campaignId, input.offerId);
  const legData = input.leg === "outbound" ? rental.outbound_delivery : rental.return_delivery;
  if (legData?.tracking_id) {
    return syncCsrCapabilityRentalDelhivery({
      campaignId: input.campaignId,
      offerId: input.offerId,
      leg: input.leg,
    });
  }
  return autoBookCsrCapabilityDelhivery(input);
}

export async function bookCsrCapabilityRentalDelhivery(input: {
  campaignId: string;
  offerId: number;
  leg: "outbound" | "return";
  bookedByUserId: number;
}) {
  const { campaign, rental } = await loadCampaignRentalByOffer(input.campaignId, input.offerId);
  if (!shouldUseDelhiveryForCsrCapabilityRental(rental)) {
    throw new Error("Delhivery booking applies to material capability rentals only");
  }

  const existingLeg = input.leg === "outbound" ? rental.outbound_delivery : rental.return_delivery;
  if (existingLeg?.tracking_id && !existingLeg?.last_status?.toLowerCase().includes("cancel")) {
    throw new Error("Delhivery shipment is already booked for this leg");
  }

  const { data: offer, error: offerError } = await supabase
    .from("service_offers")
    .select("*")
    .eq("id", input.offerId)
    .single();
  if (offerError || !offer) throw new Error("Capability offer not found");

  const { data: bookingUser } = await supabase
    .from("users")
    .select("profile_data")
    .eq("id", input.bookedByUserId)
    .single();

  const pickupLocationName = resolveDelhiveryPickupLocationName(
    input.bookedByUserId,
    bookingUser?.profile_data
  );

  const providerAddress = await loadOfferPickupAddress(offer as Record<string, unknown>);
  const dropAddress = await loadCampaignDropAddress(
    campaign as Record<string, unknown>,
    rental.lead_ngo_user_id || null
  );

  const seller = input.leg === "outbound" ? providerAddress : dropAddress;
  const consignee = input.leg === "outbound" ? dropAddress : providerAddress;

  if (!consignee.phone) {
    throw new Error("Lead NGO phone number is required on profile for Delhivery delivery");
  }

  const orderId = `csr_${input.campaignId}_${input.offerId}_${input.leg}_${Date.now()}`;
  const booking = await createDelhiveryShipment({
    orderId,
    pickupLocationName,
    consignee: {
      name: consignee.name,
      phone: consignee.phone,
      address: consignee.addressLine,
      city: consignee.city,
      state: consignee.state,
      pincode: consignee.pincode,
    },
    seller: {
      name: seller.name,
      phone: seller.phone,
      address: seller.addressLine,
      city: seller.city,
      state: seller.state,
      pincode: seller.pincode,
    },
    paymentMode: "Prepaid",
    weightGrams: estimateOfferWeightGrams(offer as Record<string, unknown>),
    quantity: 1,
    productDescription: String(offer.title || "CSR capability material"),
    totalAmountInr: Math.max(1, Number(rental.rental_amount_inr || rental.material_total_worth_inr || 1)),
  });

  if (!booking.waybill) {
    throw new Error(booking.remark || "Delhivery booking failed");
  }

  await linkCsrCapabilityRentalTracking({
    campaignId: input.campaignId,
    offerId: input.offerId,
    leg: input.leg,
    trackingId: booking.waybill,
  });

  const synced = await syncCsrCapabilityRentalDelhivery({
    campaignId: input.campaignId,
    offerId: input.offerId,
    leg: input.leg,
    trackingId: booking.waybill,
  });

  const legKey = input.leg === "outbound" ? "outbound_delivery" : "return_delivery";
  const updatedLeg = {
    ...(synced[legKey] || {}),
    delhivery_order_id: orderId,
    booked_at: new Date().toISOString(),
    booking_error: null,
  };

  return updateCsrCapabilityRentalStatus({
    campaignId: input.campaignId,
    offerId: input.offerId,
    companyId: Number(campaign.company_id || 0) || undefined,
    patch: {
      [legKey]: updatedLeg,
    } as Partial<CsrCapabilityRentalRecord>,
  });
}

export async function listCsrCapabilityRentalsForUser(userId: number): Promise<CsrCapabilityRentalDeliveryView[]> {
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, title, company_id, status, impact_metrics");

  const offerIds = new Set<number>();
  const rows: CsrCapabilityRentalDeliveryView[] = [];

  for (const campaign of campaigns || []) {
    const rentals = parseCsrCapabilityRentals(campaign.impact_metrics).filter(
      (rental) => rental.payment_status === "paid" && shouldUseDelhiveryForCsrCapabilityRental(rental)
    );

    for (const rental of rentals) {
      const role = resolveCsrDeliveryRole(userId, rental);
      if (!role) continue;
      offerIds.add(Number(rental.service_offer_id));
      rows.push({
        campaign_id: String(campaign.id),
        campaign_title: campaign.title || null,
        campaign_status: campaign.status || null,
        company_id: Number(campaign.company_id || 0),
        role,
        rental,
      });
    }
  }

  if (offerIds.size === 0) return rows;

  const { data: offers } = await supabase
    .from("service_offers")
    .select("id, title")
    .in("id", [...offerIds]);

  const titles = new Map<number, string>((offers || []).map((row) => [Number(row.id), String(row.title || "")]));

  return rows.map((row) => ({
    ...row,
    offer_title: titles.get(Number(row.rental.service_offer_id)) || `Offer #${row.rental.service_offer_id}`,
  }));
}

export async function syncAllCsrCapabilityRentalsDelhivery() {
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, company_id, impact_metrics")
    .not("impact_metrics", "is", null);

  let synced = 0;
  let retried = 0;
  for (const campaign of campaigns || []) {
    const rentals = parseCsrCapabilityRentals(campaign.impact_metrics).filter(
      (rental) => rental.payment_status === "paid" && shouldUseDelhiveryForCsrCapabilityRental(rental)
    );

    for (const rental of rentals) {
      const outboundId = String(rental.outbound_delivery?.tracking_id || "").trim();
      const returnId = String(rental.return_delivery?.tracking_id || "").trim();

      if (
        !outboundId &&
        rental.outbound_delivery?.booking_error &&
        ["paid", "attached"].includes(rental.status)
      ) {
        try {
          await autoBookCsrCapabilityDelhivery({
            campaignId: String(campaign.id),
            offerId: Number(rental.service_offer_id),
            leg: "outbound",
            bookedByUserId: Number(rental.provider_user_id || 0),
            companyId: Number(campaign.company_id || 0) || undefined,
          });
          retried += 1;
        } catch (error) {
          console.error("CSR outbound Delhivery retry failed:", error);
        }
      }

      if (
        !returnId &&
        rental.return_delivery?.booking_error &&
        rental.status === "return_pending"
      ) {
        try {
          await autoBookCsrCapabilityDelhivery({
            campaignId: String(campaign.id),
            offerId: Number(rental.service_offer_id),
            leg: "return",
            bookedByUserId: Number(rental.lead_ngo_user_id || 0),
            companyId: Number(campaign.company_id || 0) || undefined,
          });
          retried += 1;
        } catch (error) {
          console.error("CSR return Delhivery retry failed:", error);
        }
      }

      const shouldSyncOutbound =
        outboundId &&
        !rental.outbound_delivered_at &&
        ["paid", "attached", "outbound_dispatched"].includes(rental.status);
      const shouldSyncReturn =
        returnId && !rental.return_delivered_at && ["return_pending", "project_active"].includes(rental.status);

      try {
        if (shouldSyncOutbound) {
          await syncCsrCapabilityRentalDelhivery({
            campaignId: String(campaign.id),
            offerId: Number(rental.service_offer_id),
            leg: "outbound",
          });
          synced += 1;
        }
        if (shouldSyncReturn) {
          await syncCsrCapabilityRentalDelhivery({
            campaignId: String(campaign.id),
            offerId: Number(rental.service_offer_id),
            leg: "return",
          });
          synced += 1;
        }
      } catch (error) {
        console.error("CSR capability Delhivery sync failed:", {
          campaignId: campaign.id,
          offerId: rental.service_offer_id,
          error,
        });
      }
    }
  }

  return { synced, retried };
}