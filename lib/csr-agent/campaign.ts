import { supabase } from "@/lib/db";
import { z } from "zod";

// ----------- Schemas -----------

const CampaignDraftSchema = z.object({
  title:            z.string().min(1),
  description:      z.string().min(1),
  category:         z.string().min(1),
  location:         z.string().min(1),
  budget_inr:       z.number().int().nonnegative(),
  budget_breakdown: z.record(z.number()),
  schedule_vii:     z.string().min(1),
  sdg_alignment:    z.array(z.number().int()),
  start_date:       z.string(),
  end_date:         z.string(),
  impact_metrics: z.object({
    beneficiaries: z.number().int(),
    duration:      z.string(),
  }),
  milestones: z.array(
    z.object({
      title:            z.string(),
      description:      z.string(),
      duration_weeks:   z.number().int(),
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