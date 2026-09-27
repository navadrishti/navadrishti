import { supabase } from "@/lib/db";
import { parseJsonObject } from "@/lib/utils";
import {
  parseCsrCapabilityRentals,
  rentalRecordKey,
  upsertCsrCapabilityRental,
  type CsrCapabilityRentalRecord,
} from "@/lib/service-engagement";

export async function loadCompanyCampaign(campaignId: string, companyId: number) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("company_id", companyId)
    .single();
  if (error || !data) throw new Error("Campaign not found");
  return data;
}

export async function saveCampaignRentals(campaignId: string, companyId: number, rentals: CsrCapabilityRentalRecord[]) {
  const campaign = await loadCompanyCampaign(campaignId, companyId);
  const impact = parseJsonObject(campaign.impact_metrics);
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

export async function saveCampaignImpactIfUnchanged(input: {
  campaignId: string;
  companyId: number;
  previousUpdatedAt: string | null;
  impactMetrics: ReturnType<typeof parseJsonObject>;
}): Promise<string | null> {
  const updatedAt = new Date().toISOString();
  const query = supabase
    .from("campaigns")
    .update({ impact_metrics: input.impactMetrics, updated_at: updatedAt })
    .eq("id", input.campaignId)
    .eq("company_id", input.companyId);
  const guarded = input.previousUpdatedAt
    ? query.eq("updated_at", input.previousUpdatedAt)
    : query.is("updated_at", null);
  const { data, error } = await guarded.select("id");
  if (error) throw new Error(error.message || "Failed to save CSR capability rentals");
  return Array.isArray(data) && data.length > 0 ? updatedAt : null;
}

export async function getCsrCapabilityRentals(campaignId: string, companyId: number) {
  const campaign = await loadCompanyCampaign(campaignId, companyId);
  return parseCsrCapabilityRentals(campaign.impact_metrics);
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
  const impact = parseJsonObject(campaign.impact_metrics);
  await supabase
    .from("campaigns")
    .update({ impact_metrics: { ...impact, csr_capability_rentals: next } })
    .eq("id", input.campaignId);

  return next.find((row) => row.id === id)!;
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
