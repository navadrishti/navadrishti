import Razorpay from "razorpay";
import { supabase } from "@/lib/db";
import { createPlatformPricedOrder } from "@/lib/razorpay-route";
import { parseJsonObject } from "@/lib/utils";
import {
  addDaysIso,
  buildAssignmentMeta,
  buildCsrDeliveryLocation,
  CSR_OUTBOUND_DISPATCH_DAYS,
  parseCsrCapabilityRentals,
  rentalRecordKey,
  resolveCsrRentalAmountInr,
  resolveMaterialTotalWorthInr,
  shouldUseDelhiveryForCsrCapabilityRental,
  upsertCsrCapabilityRental,
  type CsrCapabilityRentalRecord,
} from "@/lib/service-engagement";
import { autoBookCsrCapabilityDelhivery } from "./delhivery-booking";
import { getCsrCapabilityRentals, loadCompanyCampaign, saveCampaignRentals } from "./rental-store";

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

  const leadNgoId = Number(campaign.lead_ngo_user_id || 0) || null;
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
  const leadNgoId = Number(campaign.lead_ngo_user_id || 0) || null;

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
      target_type: assignmentMeta.target_type,
      target_id: assignmentMeta.target_id,
      application_table: assignmentMeta.application_table,
      application_id: assignmentMeta.application_id,
      owner_user_id: offer.creator_id,
      assignee_user_id: leadNgoId || input.companyId,
      assigned_by_user_id: input.companyId,
      status: "active",
      billing_cycle: assignmentMeta.billing_cycle,
      payment_mode: assignmentMeta.payment_mode,
      valid_until: assignmentMeta.valid_until,
      assigned_at: assignmentMeta.assigned_at,
      rate_per_unit: assignmentMeta.rate_per_unit,
      rate_currency: assignmentMeta.currency,
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

  const offerDetails = parseJsonObject(offer.offer_details);
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

  const impact = parseJsonObject(campaign.impact_metrics);
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

export async function verifyPaidCsrOffersForPublish(campaignId: string, companyId: number) {
  const campaign = await loadCompanyCampaign(campaignId, companyId);
  const impact = parseJsonObject(campaign.impact_metrics);
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
