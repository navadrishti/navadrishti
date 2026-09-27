import Razorpay from "razorpay";
import { supabase } from "@/lib/db";
import { emailService } from "@/lib/email";
import { isPickedUpTrackingStatus } from "@/lib/service-request-allocation";
import { parseJsonObject } from "@/lib/utils";
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
      const impact = parseJsonObject(campaign.impact_metrics);
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
              const profile = parseJsonObject(companyUser.profile_data);
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

      const { csr_rental_lock: _removed, ...restDetails } = parseJsonObject(offerRow?.offer_details);

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
    subject: "Reminder: CSR capability penalty pending on GRAM",
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

  const impact = parseJsonObject(campaign.impact_metrics);
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
