import { supabase } from "@/lib/db";
import { createDelhiveryShipment } from "@/lib/delhivery";
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

  const profile = parseJsonObject(user.profile_data);
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
    name: String(user.name || profile.organization_name || "GRAM NGO").trim(),
    phone,
    addressLine,
    city: String(user.city || profile.city || "").trim() || "NA",
    state: String(user.state_province || profile.state || profile.state_province || "").trim() || "NA",
    pincode,
  };
}

function readOfferDetails(offer: Record<string, unknown>): Record<string, unknown> {
  return offer.offer_details && typeof offer.offer_details === "object"
    ? (offer.offer_details as Record<string, unknown>)
    : {};
}

async function loadOfferPickupAddress(offer: Record<string, unknown>): Promise<CsrShippingAddress> {
  const providerId = Number(offer.creator_id || 0);
  const base = await loadUserShippingAddress(providerId);
  const details = readOfferDetails(offer);

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

function resolveDelhiveryPickupLocationName(profileData: unknown): string {
  const profile = parseJsonObject(profileData);
  const fromProfile = String(profile.delhivery_pickup_location || "").trim();
  const fromEnv = String(process.env.DELHIVERY_PICKUP_LOCATION_NAME || "").trim();
  if (fromProfile) return fromProfile;
  if (fromEnv) return fromEnv;
  throw new Error(
    "Delhivery pickup warehouse is not configured. Set DELHIVERY_PICKUP_LOCATION_NAME or profile delhivery_pickup_location"
  );
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

  const pickupLocationName = resolveDelhiveryPickupLocationName(bookingUser?.profile_data);

  const offerRecord: Record<string, unknown> = offer;
  const providerAddress = await loadOfferPickupAddress(offerRecord);
  const dropAddress = await loadCampaignDropAddress(campaign, rental.lead_ngo_user_id || null);

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
