import Razorpay from "razorpay";
import { supabase } from "@/lib/db";
import { emailService } from "@/lib/email";
import { isPickedUpTrackingStatus } from "@/lib/service-request-allocation";
import { getErrorMessage, parseJsonObject } from "@/lib/utils";
import {
  accrueCsrFine,
  addDaysIso,
  CSR_FINE_CLEARANCE_DAYS,
  CSR_RETURN_DISPATCH_DAYS,
  parseCsrCapabilityRentals,
  shouldUseDelhiveryForCsrCapabilityRental,
  type CsrCapabilityRentalRecord,
} from "@/lib/service-engagement";
import { autoBookCsrCapabilityDelhivery } from "./delhivery-booking";
import { saveCampaignImpactIfUnchanged } from "./rental-store";

export async function processCsrCapabilityDailyCompliance() {
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, company_id, title, impact_metrics, end_date, status, updated_at")
    .not("impact_metrics", "is", null);

  const now = new Date();
  let refunds = 0;
  let fines = 0;
  let reminders = 0;
  let suspended = 0;

  for (const campaign of campaigns || []) {
    const original = parseCsrCapabilityRentals(campaign.impact_metrics);
    if (original.length === 0) continue;

    let changed = false;
    const remindersToSend: CsrCapabilityRentalRecord[] = [];
    const refundedOfferIds: number[] = [];
    const rentals = original.map((rental) =>
      applyCsrRentalDailyCompliance(rental, now, {
        onFine: () => {
          fines += 1;
        },
        onReminder: (next) => {
          reminders += 1;
          remindersToSend.push(next);
        },
        markChanged: () => {
          changed = true;
        },
      })
    );

    // Refund before recording it, so a failed refund is retried tomorrow instead of being marked done.
    for (const [index, rental] of rentals.entries()) {
      if (!missedOutboundDispatch(rental, now)) continue;
      const outcome = await refundMissedOutboundDispatch(rental);
      rentals[index] = outcome.refunded
        ? { ...rental, status: "refunded", payment_status: "refunded", refund_id: outcome.refundId, refund_error: null, refunded_at: now.toISOString() }
        : { ...rental, refund_error: outcome.error };
      changed = true;
      if (outcome.refunded) refundedOfferIds.push(rental.service_offer_id);
    }

    if (changed) {
      const savedAt = await saveCampaignImpactIfUnchanged({
        campaignId: campaign.id,
        companyId: Number(campaign.company_id),
        previousUpdatedAt: campaign.updated_at ?? null,
        impactMetrics: { ...parseJsonObject(campaign.impact_metrics), csr_capability_rentals: rentals },
      });
      if (!savedAt) {
        // Someone edited the campaign meanwhile; refunds are idempotent at Razorpay, the rest reruns tomorrow.
        console.warn(`CSR compliance skipped campaign ${campaign.id}: it changed during the run`);
        continue;
      }

      refunds += refundedOfferIds.length;
      for (const offerId of refundedOfferIds) await releaseOfferRentalLock(offerId);
      for (const rental of remindersToSend) {
        await sendCsrFineReminder(rental.company_user_id, Number(rental.fine?.pending_total_inr || 0));
      }

      for (const rental of rentals) {
        if (rental.fine?.status === "overdue" && rental.fine.due_cleared_by) {
          const overdueMs = now.getTime() - new Date(rental.fine.due_cleared_by).getTime();
          if (overdueMs > CSR_FINE_CLEARANCE_DAYS * 24 * 60 * 60 * 1000) {
            const { data: companyUser } = await supabase
              .from("users")
              .select("id, email, name, profile_data, account_status")
              .eq("id", rental.company_user_id)
              .single();
            if (companyUser && companyUser.account_status !== "suspended") {
              const profile = parseJsonObject(companyUser.profile_data);
              await supabase
                .from("users")
                .update({
                  account_status: "suspended",
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
                  subject: "GRAM account suspended — CSR capability penalty overdue",
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

/** Only shipped (material) rentals have a dispatch deadline; service rentals never "dispatch". */
export function missedOutboundDispatch(rental: CsrCapabilityRentalRecord, now: Date): boolean {
  return (
    shouldUseDelhiveryForCsrCapabilityRental(rental) &&
    rental.payment_status === "paid" &&
    ["paid", "attached", "outbound_dispatched"].includes(rental.status) &&
    Boolean(rental.outbound_dispatch_due_at) &&
    !rental.outbound_delivered_at &&
    !rental.outbound_dispatched_at &&
    !isPickedUpTrackingStatus(rental.outbound_delivery?.last_status) &&
    now.getTime() > new Date(String(rental.outbound_dispatch_due_at)).getTime()
  );
}

export function applyCsrRentalDailyCompliance(
  rental: CsrCapabilityRentalRecord,
  now: Date,
  hooks: {
    onFine: () => void;
    onReminder: (rental: CsrCapabilityRentalRecord) => void;
    markChanged: () => void;
  }
): CsrCapabilityRentalRecord {
  let next = rental;

  if (
    rental.status === "return_pending" &&
    rental.return_dispatch_due_at &&
    !rental.return_delivered_at &&
    (!rental.fine || rental.fine.status === "none") &&
    now.getTime() > new Date(rental.return_dispatch_due_at).getTime() &&
    String(rental.offer_type || "").toLowerCase() === "material"
  ) {
    const base = rental.material_total_worth_inr || rental.rental_amount_inr || 0;
    next = {
      ...next,
      fine: {
        base_amount_inr: base,
        accrued_fine_inr: 0,
        pending_total_inr: base,
        due_cleared_by: addDaysIso(rental.return_dispatch_due_at, CSR_FINE_CLEARANCE_DAYS),
        status: "pending",
        reason: "Return dispatch to capability owner not completed within 2 days",
        created_at: now.toISOString(),
      },
    };
    hooks.markChanged();
  }

  if (rental.fine && ["pending", "overdue"].includes(rental.fine.status)) {
    const accrued = rental.return_delivered_at ? rental : accrueCsrFine(rental, now);
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
    hooks.onReminder(next);
  }

  return next;
}

/** Refunds whatever is still unrefunded on the rental's payment, so a retry never refunds twice. */
async function refundMissedOutboundDispatch(
  rental: CsrCapabilityRentalRecord
): Promise<{ refunded: true; refundId: string | null } | { refunded: false; error: string }> {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!rental.razorpay_payment_id) return { refunded: false, error: "Rental has no Razorpay payment to refund" };
  if (!keyId || !keySecret) return { refunded: false, error: "Razorpay is not configured" };

  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const paymentId = String(rental.razorpay_payment_id);
    const payment = await razorpay.payments.fetch(paymentId);
    const remainingPaise = Math.max(0, Number(payment.amount || 0) - Number(payment.amount_refunded || 0));
    if (remainingPaise <= 0) return { refunded: true, refundId: null };

    const { data: orderRow } = await supabase
      .from("razorpay_payment_orders")
      .select("order_notes")
      .eq("razorpay_order_id", String(rental.razorpay_order_id || payment.order_id || ""))
      .maybeSingle();
    const refund = await razorpay.payments.refund(paymentId, {
      amount: remainingPaise,
      ...(parseJsonObject(orderRow?.order_notes).route_transfer ? { reverse_all: 1 } : {}),
      notes: { reason: "csr_outbound_dispatch_sla_missed", campaign_id: rental.campaign_id },
    });
    return { refunded: true, refundId: refund?.id ? String(refund.id) : null };
  } catch (error) {
    console.error("CSR capability outbound refund failed:", error);
    return { refunded: false, error: getErrorMessage(error) || "Refund failed" };
  }
}

/** Puts a rented offer back on the marketplace once the rental is over. */
export async function releaseOfferRentalLock(offerId: number) {
  const { data: offerRow } = await supabase
    .from("service_offers")
    .select("offer_details, status")
    .eq("id", offerId)
    .maybeSingle();
  if (!offerRow) return;
  const { csr_rental_lock: lock, ...restDetails } = parseJsonObject(offerRow.offer_details);
  if (!lock) return;
  await supabase
    .from("service_offers")
    .update({ status: "active", offer_details: restDetails, updated_at: new Date().toISOString() })
    .eq("id", offerId);
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
    subject: "Reminder: CSR capability penalty pending on GRAM",
    html: `<p>Daily reminder: an outstanding CSR capability penalty of INR ${pendingTotalInr.toLocaleString("en-IN")} is pending. Unpaid balances accrue 2% daily. Clear within 10 days to avoid account suspension.</p>`,
    text: `Daily reminder: CSR capability penalty INR ${pendingTotalInr.toLocaleString("en-IN")} is pending.`,
  });
}

async function loadCampaignForCompletion(campaignId: string) {
  const { data } = await supabase
    .from("campaigns")
    .select("id, company_id, impact_metrics, updated_at")
    .eq("id", campaignId)
    .maybeSingle();
  return data;
}

/**
 * Delivered goods start their return window (the daily job fines a missed return), service
 * rentals simply end, and goods that never arrived are left to the dispatch refund.
 */
export function rentalAtProjectEnd(rental: CsrCapabilityRentalRecord, completedAt: string): CsrCapabilityRentalRecord {
  if (rental.payment_status !== "paid") return rental;
  if (["completed", "refunded", "return_pending", "return_delivered"].includes(rental.status)) return rental;

  if (!shouldUseDelhiveryForCsrCapabilityRental(rental)) {
    return { ...rental, status: "completed", project_completed_at: completedAt };
  }
  const delivered = Boolean(rental.outbound_delivered_at) || ["outbound_delivered", "project_active"].includes(rental.status);
  if (!delivered) return rental;
  return {
    ...rental,
    status: "return_pending",
    project_completed_at: completedAt,
    return_dispatch_due_at: addDaysIso(completedAt, CSR_RETURN_DISPATCH_DAYS),
  };
}

export async function markCsrProjectCompleted(input: {
  campaignId: string;
  completedAt?: string;
}) {
  const completedAt = input.completedAt || new Date().toISOString();

  let campaign: Awaited<ReturnType<typeof loadCampaignForCompletion>> = null;
  let rentals: CsrCapabilityRentalRecord[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    campaign = await loadCampaignForCompletion(input.campaignId);
    if (!campaign) throw new Error("Campaign not found");
    rentals = parseCsrCapabilityRentals(campaign.impact_metrics).map((rental) => rentalAtProjectEnd(rental, completedAt));

    const updatedAt = new Date().toISOString();
    const query = supabase
      .from("campaigns")
      .update({
        status: "completed",
        impact_metrics: { ...parseJsonObject(campaign.impact_metrics), csr_capability_rentals: rentals, completed_at: completedAt },
        updated_at: updatedAt,
      })
      .eq("id", input.campaignId);
    const { data, error } = await (campaign.updated_at ? query.eq("updated_at", campaign.updated_at) : query.is("updated_at", null)).select("id");
    if (error) throw new Error(error.message || "Failed to complete the campaign");
    if (Array.isArray(data) && data.length > 0) break;
    campaign = null;
  }
  if (!campaign) throw new Error("Campaign was updated concurrently. It will be completed on the next run.");

  for (const rental of rentals) {
    if (rental.status === "completed") await releaseOfferRentalLock(rental.service_offer_id);
  }

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
