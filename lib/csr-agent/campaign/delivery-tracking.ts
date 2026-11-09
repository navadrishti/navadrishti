import { supabase } from "@/lib/db";
import { getDelhiveryTrackingSnapshot, type DelhiveryTrackingSnapshot } from "@/lib/delhivery";
import { captureDelhiveryFreightForLeg } from "@/lib/delhivery-freight";
import { isDeliveredTrackingStatus, isPickedUpTrackingStatus } from "@/lib/service-request-allocation";
import {
  parseCsrCapabilityRentals,
  shouldUseDelhiveryForCsrCapabilityRental,
  type CsrCapabilityDeliveryLeg,
  type CsrCapabilityRentalRecord,
} from "@/lib/service-engagement";
import { loadCampaignRentalByOffer, updateCsrCapabilityRentalStatus } from "./rental-store";

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

function buildDeliveryLegFromSnapshot(
  snapshot: DelhiveryTrackingSnapshot,
  existing?: CsrCapabilityDeliveryLeg | null
): CsrCapabilityDeliveryLeg {
  const base: CsrCapabilityDeliveryLeg = {
    ...(existing || {}),
    provider: "delhivery",
    tracking_id: snapshot.trackingId,
    last_status: snapshot.currentStatus,
    last_location: snapshot.lastLocation,
    last_event_at: snapshot.lastEventAt,
    synced_at: new Date().toISOString(),
    events: snapshot.events.slice(0, 20),
  };

  // Capture confirmed freight only when the tracking payload exposes freight-named keys.
  // InvoiceAmount / CODAmount / package total_amount are never treated as freight.
  return captureDelhiveryFreightForLeg({
    existingLeg: base,
    trackingRaw: snapshot.raw,
  }).leg;
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

function applyDelhiverySnapshotToRental(
  rental: CsrCapabilityRentalRecord,
  leg: "outbound" | "return",
  snapshot: DelhiveryTrackingSnapshot,
  campaignStatus?: string | null
): Partial<CsrCapabilityRentalRecord> {
  const existingLeg = leg === "outbound" ? rental.outbound_delivery : rental.return_delivery;
  const legMeta = buildDeliveryLegFromSnapshot(snapshot, existingLeg);
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
    patch.fine = settleFineOnReturnDelivery(rental, patch.return_dispatched_at || rental.return_dispatched_at || eventAt);
  }
  return patch;
}

function settleFineOnReturnDelivery(
  rental: CsrCapabilityRentalRecord,
  returnDispatchedAt: string
): CsrCapabilityRentalRecord["fine"] {
  const fine = rental.fine;
  const returnDue = rental.return_dispatch_due_at ? new Date(rental.return_dispatch_due_at).getTime() : null;
  const returnedLate = returnDue !== null && new Date(returnDispatchedAt).getTime() > returnDue;
  const accrued = Number(fine?.accrued_fine_inr || 0);
  const outstanding = fine && ["pending", "overdue", "suspended"].includes(fine.status);

  if (outstanding && returnedLate && accrued > 0) {
    return {
      ...fine,
      base_amount_inr: 0,
      accrued_fine_inr: accrued,
      pending_total_inr: accrued,
      reason: "Late return penalty accrued before the return was delivered",
    };
  }
  if (fine?.status === "cleared") return fine;
  return {
    ...fine,
    base_amount_inr: 0,
    accrued_fine_inr: 0,
    pending_total_inr: 0,
    status: "cleared",
    reason: "Return delivered via Delhivery",
  };
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

  const updated = await updateCsrCapabilityRentalStatus({
    campaignId: input.campaignId,
    offerId: input.offerId,
    companyId: Number(campaign.company_id || 0) || undefined,
    patch: {
      logistics_provider: "delhivery",
      ...patch,
    },
  });

  // Best-effort ledger sync — only writes when a confirmed freight charge is present.
  // Never blocks tracking updates; Delhivery package value is not treated as freight.
  try {
    const { syncLogisticsExpenseFromCapabilityLegSafe } = await import(
      "@/lib/csr-agent/sync-logistics-expense"
    );
    await syncLogisticsExpenseFromCapabilityLegSafe({
      rental: updated,
      leg: input.leg,
      providerRaw: snapshot.raw,
    });
  } catch (error) {
    console.warn("[csr-capability-delivery] logistics expense sync skipped", error);
  }

  return updated;
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
