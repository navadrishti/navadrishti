import { z } from "zod";
import { GeminiChat, GeminiError } from "@/lib/geminiClient";

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text
    .replace(/^```(?:json)?\s*/gm, "")
    .replace(/\s*```$/gm, "")
    .trim();

  const tryParseObject = (value: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = tryParseObject(cleaned);
  if (direct) return direct;

  const start = cleaned.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{") depth++;
      if (ch === "}") depth--;

      if (depth === 0) {
        const parsed = tryParseObject(cleaned.slice(start, i + 1));
        if (parsed) return parsed;
        break;
      }
    }
  }

  throw new Error(`Could not parse JSON from LLM output: ${cleaned.slice(0, 200)}`);
}

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

// Milestone defined by the user in the request
export const requestMilestoneSchema = z.object({
  title:            z.string().trim().optional(),
  description:      z.string().min(1),
  budget_allocated: z.number().positive(),
  start_date:       z.string().trim().optional(),
  end_date:         z.string().trim().optional(),
});

export const generateCampaignsInputSchema = z.object({
  // Optional from clients — the API always rebinds this to the authenticated company.
  company_id:     z.string().min(1).optional(),
  budget:         z.number().positive(),
  milestones:     z.number().int().min(1).max(10),
  category:       z.string().min(1),
  city:           z.string().min(1),
  state_province: z.string().min(1),
  start_date:     z.string().min(1),
  end_date:       z.string().min(1),
  beneficiaries:  z.string().trim().optional(),
  volunteerRequirement: z.string().trim().optional(),
  milestone_info: z.array(requestMilestoneSchema).optional(),
  requirementDetails: z.string().trim().optional(),
});

// Milestone returned by the LLM in the response
export const responseMilestoneSchema = z.object({
  title:            z.string(),
  description:      z.string(),
  duration_weeks:   coerceInteger(z.number().int().nonnegative()),
  budget_allocated: z.number(),
  deliverables:     z.array(z.string()),
  start_date:       z.string().trim().optional(),
  end_date:         z.string().trim().optional(),
});

export const campaignSchema = z.object({
  title:       z.string(),
  description: z.string(),
  category:    z.string(),
  location:    z.string(),
  budget_inr:  z.number(),

  budget_breakdown: z.object({
    infrastructure: z.number(),
    training:       z.number(),
    materials:      z.number(),
    monitoring:     z.number(),
    contingency:    z.number(),
  }),

  schedule_vii:  z.string(),
  sdg_alignment: z.array(coerceInteger(z.number().int().positive())),
  start_date:    z.string(),
  end_date:      z.string(),

  impact_metrics: z.object({
    beneficiaries: coerceInteger(z.number().int().nonnegative()),
    duration:      z.string(),
  }),

  milestones: z.array(responseMilestoneSchema),
});

export const campaignResponseSchema = z.object({
  campaigns: z.array(campaignSchema),
});

export type RequestMilestone      = z.infer<typeof requestMilestoneSchema>;
export type GenerateCampaignsInput = z.infer<typeof generateCampaignsInputSchema>;
export type ResponseMilestone     = z.infer<typeof responseMilestoneSchema>;
export type Campaign               = z.infer<typeof campaignSchema>;

const SCHEDULE_VII = `
Schedule VII Categories (Companies Act 2013):
i   - Hunger, poverty, malnutrition, health, sanitation
ii  - Education, vocational skills, livelihood
iii - Gender equality, women empowerment
iv  - Environment, ecology, conservation
v   - National heritage, art, culture
vi  - Armed forces veterans
vii - Rural/Olympic/Paralympic sports
viii- Technology incubators
ix  - Rural development
x   - Slum development
xi  - Disaster management
xii - Other (PM Relief Fund)
`;

const safeNumber = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback)

const splitBudget = (total: number, percentages: [number, number, number, number, number]) => {
  const normalized = percentages.map((percent) => Math.max(0, percent))
  const sum = normalized.reduce((acc, value) => acc + value, 0) || 1
  const raw = normalized.map((percent) => Math.round((total * percent) / sum))
  const used = raw.reduce((acc, value) => acc + value, 0)
  raw[raw.length - 1] += total - used

  return {
    infrastructure: raw[0],
    training: raw[1],
    materials: raw[2],
    monitoring: raw[3],
    contingency: raw[4],
  }
}

const distributeMilestoneBudget = (total: number, count: number, preferred?: number[]) => {
  if (count <= 0) return []

  const cleanPreferred = (preferred || []).map((value) => Math.max(0, Math.round(safeNumber(value)))).slice(0, count)
  while (cleanPreferred.length < count) cleanPreferred.push(0)

  const preferredSum = cleanPreferred.reduce((acc, value) => acc + value, 0)
  if (preferredSum > 0) {
    const scaled = cleanPreferred.map((value) => Math.round((value / preferredSum) * total))
    const used = scaled.reduce((acc, value) => acc + value, 0)
    scaled[scaled.length - 1] += total - used
    return scaled
  }

  const base = Math.floor(total / count)
  const remainder = total - base * count
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0))
}

export const suggestMilestonesInputSchema = z.object({
  company_id: z.string().min(1).optional(),
  campaignName: z.string().trim().optional(),
  category: z.string().min(1),
  city: z.string().min(1),
  state_province: z.string().min(1),
  budget: z.number().positive(),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  volunteerRequirement: z.string().trim().optional(),
  requirementDetails: z.string().trim().optional(),
  refresh: z.boolean().optional(),
})

const suggestedMilestoneItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  budget_allocated: z.number().nonnegative(),
  start_date: z.string().trim().optional(),
  end_date: z.string().trim().optional(),
})

const suggestedMilestoneSetSchema = z.object({
  title: z.string().min(1),
  milestones: z.array(suggestedMilestoneItemSchema).min(1).max(10),
})

export const suggestMilestonesResponseSchema = z.object({
  sets: z.array(suggestedMilestoneSetSchema).min(1).max(5),
})

export type SuggestMilestonesInput = z.infer<typeof suggestMilestonesInputSchema>
export type SuggestedMilestoneSetDraft = z.infer<typeof suggestedMilestoneSetSchema>

function buildMilestoneSuggestionPrompt(input: SuggestMilestonesInput): string {
  const location = `${input.city}${input.state_province ? `, ${input.state_province}` : ""}`
  const refreshNote = input.refresh
    ? "Provide alternate phasing from any previous suggestion — vary titles and sequencing."
    : "Prefer practical on-ground phases for Indian CSR delivery."

  return `
You are Catalyst's milestone planner for Indian CSR campaigns.
Suggest 3 distinct milestone sets from the company's intake. Do not invent a full campaign draft.

${SCHEDULE_VII}

-----------------------------------
INTAKE
-----------------------------------
- Campaign name: ${input.campaignName || "(untitled)"}
- Category / Schedule VII focus: ${input.category}
- Location: ${location}
- Budget (INR): ${input.budget}
- Start: ${input.start_date}
- End: ${input.end_date}
- Volunteer requirement: ${input.volunteerRequirement || "(not specified)"}
- Requirement details: ${input.requirementDetails || "(not specified)"}

-----------------------------------
RULES
-----------------------------------
- Return EXACTLY 3 sets with different lengths (e.g. short ~3, standard ~5, extended ~7-8) when the timeline allows.
- Each set's milestone budget_allocated values must sum EXACTLY to ${input.budget}.
- Keep milestone dates within ${input.start_date} to ${input.end_date} when dates are provided.
- Titles and descriptions must be concrete and tied to the intake (category, location, requirement details).
- ${refreshNote}
- Output MUST be raw JSON only. No markdown.

-----------------------------------
OUTPUT FORMAT
-----------------------------------
{
  "sets": [
    {
      "title": "Short (3 milestones)",
      "milestones": [
        {
          "title": "string",
          "description": "string",
          "budget_allocated": 0,
          "start_date": "${input.start_date}",
          "end_date": "${input.end_date}"
        }
      ]
    }
  ]
}
`
}

function rebalanceMilestoneBudgets(
  milestones: SuggestedMilestoneSetDraft["milestones"],
  totalBudget: number,
): SuggestedMilestoneSetDraft["milestones"] {
  if (milestones.length === 0) return milestones
  const amounts = distributeMilestoneBudget(
    totalBudget,
    milestones.length,
    milestones.map((m) => safeNumber(m.budget_allocated)),
  )
  return milestones.map((milestone, index) => ({
    ...milestone,
    budget_allocated: amounts[index] || 0,
  }))
}

/** Gemini-backed milestone set suggestions from company intake. */
export async function suggestMilestoneSets(input: SuggestMilestonesInput): Promise<SuggestedMilestoneSetDraft[]> {
  const prompt = buildMilestoneSuggestionPrompt(input)

  try {
    const raw = await GeminiChat([{ role: "user", content: prompt }])
    const parsed = parseJson(raw)
    const result = suggestMilestonesResponseSchema.safeParse(parsed)

    if (!result.success) {
      console.error("Milestone suggestion validation failed:", result.error.flatten())
      throw new Error("Invalid LLM response structure")
    }

    return result.data.sets.map((set) => ({
      ...set,
      milestones: rebalanceMilestoneBudgets(set.milestones, Math.round(input.budget)),
    }))
  } catch (err) {
    if (err instanceof GeminiError) {
      console.error("Milestone suggestion API error:", err.message)
      throw new Error("Milestone suggestions are currently unavailable.")
    }

    if (err instanceof Error && err.message) {
      if (
        err.message.includes("GEMINI_API_KEY is missing") ||
        err.message.includes("API Key not found") ||
        err.message.includes("API_KEY_INVALID")
      ) {
        throw new Error("Milestone suggestions are currently unavailable.")
      }
    }

    console.error("Milestone suggestion parse failed:", err)
    throw new Error("Failed to parse LLM response")
  }
}

/**
 * Assemble campaign drafts from the questionnaire.
 *
 * This intentionally remains deterministic: the questionnaire is the source
 * of truth for publishable campaign data.
 */
export async function generateCampaigns(input: GenerateCampaignsInput): Promise<Campaign[]> {
  return assembleCampaigns(input)
}

/** @deprecated Prefer assembleCampaigns — kept for callers/tests that used the fallback name. */
export function buildFallbackCampaigns(input: GenerateCampaignsInput): Campaign[] {
  return assembleCampaigns(input)
}

/**
 * Assemble exactly one publishable campaign draft from intake + selected milestones.
 * Generative AI is not used here — milestones must already come from the user or Catalyst suggestions.
 */
export function assembleCampaigns(input: GenerateCampaignsInput): Campaign[] {
  const location = `${input.city}${input.state_province ? `, ${input.state_province}` : ""}`
  const campaignCategory = input.category.trim()
  const budget = Math.max(1, Math.round(input.budget))
  const milestoneCount = Math.max(1, Math.min(10, Math.round(input.milestones || 1)))
  const requirementText = (input.requirementDetails || "community impact").trim()
  const volunteerRequirement = (input.volunteerRequirement || "cross-functional volunteer support").trim()
  const sourceMilestones = Array.isArray(input.milestone_info) ? input.milestone_info : []

  const defaultMilestones: RequestMilestone[] = Array.from({ length: milestoneCount }, (_, index) => ({
    description: `Phase ${index + 1} implementation for ${requirementText}`,
    budget_allocated: 0,
  }))

  const seedMilestones = sourceMilestones.length > 0
    ? sourceMilestones.slice(0, milestoneCount)
    : defaultMilestones

  const preferredBudgets = seedMilestones.map((milestone) => safeNumber(milestone.budget_allocated))
  const milestoneBudgets = distributeMilestoneBudget(budget, seedMilestones.length, preferredBudgets)

  const milestones: ResponseMilestone[] = seedMilestones.map((source, index) => {
    const sourceTitle = String(source.title || '').trim()
    const sourceDescription = String(source.description || '').trim()
    const weeks = Math.max(1, Math.floor((index + 1 + milestoneCount) / milestoneCount))

    return {
      title: sourceTitle || `Milestone ${index + 1}`,
      description: sourceDescription || `Deliver the ${requirementText.toLowerCase()} workstream in ${location}.`,
      duration_weeks: weeks,
      budget_allocated: milestoneBudgets[index] || 0,
      start_date: source.start_date,
      end_date: source.end_date,
      deliverables: [
        `Phase ${index + 1} plan approved`,
        `Execution evidence recorded for ${location}`,
        `KPI checkpoint completed for phase ${index + 1}`,
      ],
    }
  })

  return [
    {
      title: `${campaignCategory} Campaign — ${input.city}`,
      description: `A ${campaignCategory.toLowerCase()} initiative in ${location} focused on ${requirementText.toLowerCase()}. Delivery will follow the selected milestones with ${volunteerRequirement.toLowerCase()}.`,
      category: campaignCategory,
      location,
      budget_inr: budget,
      budget_breakdown: splitBudget(budget, [40, 20, 20, 12, 8]),
      schedule_vii: campaignCategory,
      sdg_alignment: [4, 8, 11],
      start_date: input.start_date,
      end_date: input.end_date,
      impact_metrics: {
        beneficiaries: Math.max(50, Math.round(budget / 5000)),
        duration: `${input.start_date} to ${input.end_date}`,
      },
      milestones,
    },
  ]
}