import { supabase } from "@/lib/db";
import { assertDelhiveryRouteServiceable, createDelhiveryShipment } from "@/lib/delhivery";
import {
  ensureDelhiveryPickupLocation,
  isCompleteAddress,
  loadDelhiveryParty,
  readStructuredAddress,
  withAddress,
  type DelhiveryParty,
} from "@/lib/delhivery-parties";
import { isCancelledTrackingStatus } from "@/lib/service-request-allocation";
import { parseJsonObject } from "@/lib/utils";
import {
  buildCsrDeliveryLocation,
  parseCsrCapabilityRentals,
  shouldUseDelhiveryForCsrCapabilityRental,
  type CsrCapabilityRentalRecord,
} from "@/lib/service-engagement";
import { linkCsrCapabilityRentalTracking, syncCsrCapabilityRentalDelhivery } from "./delivery-tracking";
import { loadCampaignRentalByOffer, updateCsrCapabilityRentalStatus } from "./rental-store";

type DeliveryLegName = "outbound" | "return";

function readOfferDetails(offer: Record<string, unknown>): Record<string, unknown> {
  return parseJsonObject(offer.offer_details);
}

async function loadProviderParty(offer: Record<string, unknown>): Promise<DelhiveryParty> {
  const provider = await loadDelhiveryParty(Number(offer.creator_id || 0), "the capability provider's");
  const pickupAddress = readStructuredAddress(readOfferDetails(offer).pickup_address);
  return isCompleteAddress(pickupAddress) ? withAddress(provider, pickupAddress) : provider;
}

/** The lead NGO receives the material, at the campaign site when it has a complete address. */
async function loadCampaignSiteParty(
  campaign: Record<string, unknown>,
  leadNgoUserId: number | null
): Promise<DelhiveryParty> {
  const leadId = Number(leadNgoUserId || 0);
  if (leadId <= 0) {
    throw new Error("A lead NGO must accept the campaign before Delhivery can deliver the material");
  }
  const leadNgo = await loadDelhiveryParty(leadId, "the lead NGO's");
  const site = buildCsrDeliveryLocation(campaign);
  const siteAddress = readStructuredAddress({
    address_line: site?.location,
    city: site?.city,
    state: site?.state,
    pincode: site?.pincode,
  });
  return isCompleteAddress(siteAddress) ? withAddress(leadNgo, siteAddress) : leadNgo;
}

function toShipmentParty(party: DelhiveryParty) {
  return {
    name: party.name,
    phone: party.phone,
    address: party.address,
    city: party.city,
    state: party.state,
    pincode: party.pincode,
    country: party.country,
  };
}

function estimateOfferWeightGrams(offer: Record<string, unknown>): number {
  const details = readOfferDetails(offer);
  const quantity = Number(details.quantity || 1);
  const perUnit = Number(details.weight_grams || details.weight || 500);
  const total = Math.round(Math.max(1, quantity) * Math.max(100, perUnit));
  return Number.isFinite(total) ? total : 500;
}

async function recordCsrDeliveryBookingFailure(input: {
  campaignId: string;
  offerId: number;
  leg: DeliveryLegName;
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
  leg: DeliveryLegName;
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
  leg: DeliveryLegName;
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
  leg: DeliveryLegName;
  bookedByUserId: number;
}) {
  const { campaign, rental } = await loadCampaignRentalByOffer(input.campaignId, input.offerId);
  if (!shouldUseDelhiveryForCsrCapabilityRental(rental)) {
    throw new Error("Delhivery booking applies to material capability rentals only");
  }

  const existingLeg = input.leg === "outbound" ? rental.outbound_delivery : rental.return_delivery;
  if (existingLeg?.tracking_id && !isCancelledTrackingStatus(existingLeg?.last_status)) {
    throw new Error("Delhivery shipment is already booked for this leg");
  }

  const { data: offer, error: offerError } = await supabase
    .from("service_offers")
    .select("*")
    .eq("id", input.offerId)
    .single();
  if (offerError || !offer) throw new Error("Capability offer not found");

  const offerRecord: Record<string, unknown> = offer;
  const siteParty = await loadCampaignSiteParty(campaign, rental.lead_ngo_user_id || null);
  const providerParty = await loadProviderParty(offerRecord);

  const seller = input.leg === "outbound" ? providerParty : siteParty;
  const consignee = input.leg === "outbound" ? siteParty : providerParty;

  await assertDelhiveryRouteServiceable(seller.pincode, consignee.pincode);
  const pickupLocationName = await ensureDelhiveryPickupLocation(seller);

  // A fixed order id lets Delhivery reject a retried booking as a duplicate instead of shipping twice.
  const orderId = existingLeg?.tracking_id
    ? `csr_${input.campaignId}_${input.offerId}_${input.leg}_${Date.now()}`
    : `csr_${input.campaignId}_${input.offerId}_${input.leg}`;
  const booking = await createDelhiveryShipment({
    orderId,
    pickupLocationName,
    consignee: toShipmentParty(consignee),
    seller: toShipmentParty(seller),
    paymentMode: "Prepaid",
    weightGrams: estimateOfferWeightGrams(offerRecord),
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
