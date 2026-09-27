import { supabase } from "@/lib/db";
import { getDelhiveryTrackingSnapshot, type DelhiveryTrackingSnapshot } from "@/lib/delhivery";
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
