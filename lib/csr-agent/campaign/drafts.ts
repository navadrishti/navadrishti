import { z } from "zod";
import { supabase } from "@/lib/db";
import { parseJsonObject } from "@/lib/utils";
import type { TablesUpdate } from "@/lib/database.types";

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

export const UpdateSelectedCampaignSchema = z.object({
  campaign:    CampaignDraftSchema.partial().optional(),
  company_id:  z.number().int(),
  campaign_id: z.string().uuid(),
});

export async function getCampaignStatus(id: string, company_id: number) {
  const { data } = await supabase
    .from("campaigns")
    .select("status")
    .eq("id", id)
    .eq("company_id", company_id)
    .single();
  return data?.status || null;
}

/**
 * Only drafts can be edited. impact_metrics is merged into the stored object because the schema
 * strips server-owned keys (lead NGO invites, rentals, invited offers) that must survive the edit.
 */
export async function updateCampaignDb(
  id: string,
  company_id: number,
  updates: Partial<z.infer<typeof CampaignDraftSchema>>
) {
  const { impact_metrics: impactUpdates, ...rest } = updates;
  let payload: TablesUpdate<"campaigns"> = rest;
  let previousUpdatedAt: string | null | undefined;

  if (impactUpdates) {
    const { data: current, error: readError } = await supabase
      .from("campaigns")
      .select("impact_metrics, updated_at")
      .eq("id", id)
      .eq("company_id", company_id)
      .maybeSingle();
    if (readError) throw new Error(readError.message || "Update failed");
    if (!current) throw new Error("Campaign not found");
    previousUpdatedAt = current.updated_at ?? null;
    payload = {
      ...rest,
      impact_metrics: { ...parseJsonObject(current.impact_metrics), ...impactUpdates },
      updated_at: new Date().toISOString(),
    };
  }

  let query = supabase
    .from("campaigns")
    .update(payload)
    .eq("id", id)
    .eq("company_id", company_id)
    .eq("status", "draft");
  if (previousUpdatedAt !== undefined) {
    query = previousUpdatedAt ? query.eq("updated_at", previousUpdatedAt) : query.is("updated_at", null);
  }
  const { data, error } = await query.select("id, title, status").maybeSingle();

  if (error) {
    throw new Error(error.message || "Update failed");
  }
  if (!data) {
    throw new Error(
      previousUpdatedAt !== undefined
        ? "Campaign was updated concurrently. Refresh and try again."
        : "Update failed"
    );
  }
  return data;
}
