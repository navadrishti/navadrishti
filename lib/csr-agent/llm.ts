import { z } from "zod";
import { GeminiChat, GeminiError } from "@/lib/geminiClient";
import { parseJson } from "./json-parser";

/* ───────────────── SCHEMAS ───────────────── */

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
  company_id:     z.string().min(1),
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

type CampaignLever = "Direct Implementation" | "Capacity Building" | "Access & Distribution"

/* ───────────────── CONSTANTS ───────────────── */

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

/* ───────────────── HELPERS ───────────────── */

function buildPrompt(input: GenerateCampaignsInput): string {
  const {
    budget,
    category,
    city,
    state_province,
    start_date,
    end_date,
    milestones,
    milestone_info,
    requirementDetails,
  } = input;

  const locationStr = `${city}${state_province ? `, ${state_province}` : ""}`;

  return `
You are a CSR strategy expert helping Indian companies design practical, real-world CSR campaign drafts.

The goal is to generate **80% complete, realistic campaign drafts** that companies can refine further.
Output must be concise, actionable, and strictly formatted.

${SCHEDULE_VII}

-----------------------------------
COMPANY REQUIREMENTS
-----------------------------------
- Budget: ₹${budget}
- Category: ${category}
- Location: ${locationStr}
- Start Date: ${start_date}
- End Date: ${end_date}
- Milestones: ${milestones}
- User defined Milestone Details: ${JSON.stringify(milestone_info ?? [])}
- Additional Requirement Details: ${requirementDetails}

-----------------------------------
REAL-WORLD RULES
-----------------------------------

1. **Budget Consistency**
- Total of milestone budgets must exactly match ${budget}
- budget_breakdown keys must sum exactly to budget_inr
- Allocate logically per campaign type

2. **Timeline Consistency**
- Distribute timeline logically across milestones
- Sum of milestone.duration_weeks ≈ total timeline in weeks

3. **Execution Realism (Concise)**
Each campaign must clearly state:
- Beneficiary identification method and should be a whole integer.
- Delivery model (NGO partner, camps, direct build, etc.)
- 2-3 specific ground execution steps in ${locationStr}
- Description max 40 words per campaign

4. **Milestone Enhancement**
For each milestone:
- Assign logical duration_weeks and duration_days (7 days = 1 week)
- Define upto 3 clear, measurable deliverables

5. **Diversity (Zero Overlap)**
Generate EXACTLY 3 campaigns, each solving the problem through a different operational "Lever":
- **Campaign 1 (Direct Implementation):** Use ${JSON.stringify(milestone_info ?? [])} as the direct blueprint. Focus on infrastructure and physical build.
- **Campaign 2 (Capacity Building):** Pivot toward training, workshops, and institutional strengthening. Adapt milestones to focus on "Human Capital."
- **Campaign 3 (Access & Distribution):** Pivot toward kits, logistics, and last-mile resource delivery. Adapt milestones to focus on "Tangible Goods."

-----------------------------------
STRICT RULES
-----------------------------------
- schedule_vii must directly align with ${category}
- beneficiaries must be a whole integer
- Output MUST be raw, valid JSON
- NO markdown, NO code blocks, NO extra text, NO conversational filler
- Use numbers for all budget/time fields, not strings
- For Campaign 1: Strictly use the descriptions and budgets from ${JSON.stringify(milestone_info ?? [])}. Do not alter them.
- For Campaigns 2 & 3: ADAPT milestone descriptions and deliverables to match their respective lever (Capacity Building or Access & Distribution).
- Do not reuse milestone titles, descriptions, or logic from Campaign 1 in Campaigns 2 or 3. Each campaign must have a completely unique operational roadmap.

-----------------------------------
OUTPUT FORMAT
-----------------------------------

{
  "campaigns": [
    {
      "title": "string",
      "description": "max 40 words: execution method, beneficiary ID, ground steps in ${locationStr} with respect to ${requirementDetails}",
      "category": "${category}",
      "location": "${locationStr}",
      "budget_inr": ${budget},

      "budget_breakdown": {
        "infrastructure": 0,
        "training": 0,
        "materials": 0,
        "monitoring": 0,
        "contingency": 0
      },

      "schedule_vii": "string",
      "sdg_alignment": [1, 4],
      "start_date": "${start_date}",
      "end_date": "${end_date}",

      "impact_metrics": {
        "beneficiaries": 0,
        "duration": "${start_date} to ${end_date}"
      },

      "milestones": [
        {
          "title": "string",
          "description": "max 35 words: specific action",
          "duration_days": 0,
          "duration_weeks": 0,
          "budget_allocated": 0,
          "deliverables": ["string", "string", "string"]
        }
      ]
    }
  ]
}
`;
}

/* ───────────────── SERVICE ───────────────── */



export async function generateCampaigns(input: GenerateCampaignsInput): Promise<Campaign[]> {
  const prompt = buildPrompt(input);
  

  try {
    const raw = await GeminiChat([{ role: "user", content: prompt }]);
    const parsed = parseJson(raw);
    const result = campaignResponseSchema.safeParse(parsed);

    if (!result.success) {
      console.error("Campaign response validation failed:", result.error.flatten());
      throw new Error("Invalid LLM response structure");
    }

    return result.data.campaigns;
  } catch (err) {
    if (err instanceof GeminiError) {
      console.error("Gemini API error:", err.message);
      throw new Error(`Gemini API ${err.status}: ${err.message}`);
    } 

    if (err instanceof Error && err.message) {
      if (err.message.includes("GEMINI_API_KEY is missing")) {
        throw err;
      }

      if (err.message.includes("API Key not found") || err.message.includes("API_KEY_INVALID")) {
        throw new Error("Gemini API key is invalid or missing");
      }
    }

    console.error("JSON parse failed:", err);
    throw new Error("Failed to parse LLM response");
  }
}

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

const buildMilestoneDescription = (lever: CampaignLever, sourceDescription: string, location: string) => {
  if (lever === "Direct Implementation") return sourceDescription
  if (lever === "Capacity Building") {
    return `Train local stakeholders and institutions in ${location} to operationalize: ${sourceDescription}`
  }
  return `Deliver resources and last-mile access in ${location} to realize: ${sourceDescription}`
}

export function buildFallbackCampaigns(input: GenerateCampaignsInput): Campaign[] {
  const location = `${input.city}${input.state_province ? `, ${input.state_province}` : ""}`
  const campaignCategory = input.category
  const budget = Math.max(1, Math.round(input.budget))
  const milestoneCount = Math.max(1, Math.min(10, Math.round(input.milestones || 1)))
  const requirementText = (input.requirementDetails || "community impact").trim()
    const volunteerRequirement = (input.volunteerRequirement || "cross-functional volunteer support").trim()
  const beneficiaryCount = Math.max(1, Math.round(Number(input.beneficiaries || Math.max(1, Math.round(budget / 5000))) || Math.max(1, Math.round(budget / 5000))))
  const sourceMilestones = Array.isArray(input.milestone_info) ? input.milestone_info : []

  const defaultMilestones = Array.from({ length: milestoneCount }, (_, index) => ({
    description: `Phase ${index + 1} implementation for ${requirementText}`,
    budget_allocated: 0,
  }))

  const seedMilestones = sourceMilestones.length > 0
    ? sourceMilestones.slice(0, milestoneCount)
    : defaultMilestones

  const levers: Array<{ lever: CampaignLever; titlePrefix: string; breakdown: [number, number, number, number, number] }> = [
    {
      lever: "Direct Implementation",
      titlePrefix: "Infrastructure-first",
      breakdown: [45, 15, 20, 12, 8],
    },
    {
      lever: "Capacity Building",
      titlePrefix: "Capability-first",
      breakdown: [20, 40, 15, 15, 10],
    },
    {
      lever: "Access & Distribution",
      titlePrefix: "Access-first",
      breakdown: [18, 12, 45, 15, 10],
    },
  ]

  return levers.map((config, campaignIndex) => {
    const preferredBudgets = config.lever === "Direct Implementation"
      ? seedMilestones.map((milestone) => safeNumber(milestone.budget_allocated))
      : undefined
    const milestoneBudgets = distributeMilestoneBudget(budget, seedMilestones.length, preferredBudgets)

    const milestones: ResponseMilestone[] = seedMilestones.map((source, index) => {
      const sourceTitle = String((source as any).title || '').trim()
      const sourceDescription = String(source.description || '').trim()
      const weeks = Math.max(1, Math.floor((index + 1 + milestoneCount) / milestoneCount))
      const milestoneTitle = sourceTitle || (config.lever === "Direct Implementation"
        ? `Milestone ${index + 1}: Execution`
        : config.lever === "Capacity Building"
          ? `Milestone ${index + 1}: Training Enablement`
          : `Milestone ${index + 1}: Access Delivery`)

      return {
        title: milestoneTitle,
        description: buildMilestoneDescription(config.lever, sourceDescription || `Milestone ${index + 1}`, location),
        duration_weeks: weeks,
        budget_allocated: milestoneBudgets[index] || 0,
        start_date: (source as any).start_date,
        end_date: (source as any).end_date,
        deliverables: [
          `${config.lever} plan approved for stage ${index + 1}`,
          `Execution evidence recorded for ${location}`,
          `KPI checkpoint completed for phase ${index + 1}`,
        ],
      }
    })

    return {
      title: `${config.titlePrefix} ${campaignCategory} Program ${campaignIndex + 1}`,
      description: `Ground execution in ${location} for ${requirementText}. Volunteer requirement: ${volunteerRequirement}. Uses a ${config.lever.toLowerCase()} lever with measurable beneficiaries and monitored delivery.`,
      category: campaignCategory,
      location,
      budget_inr: budget,
      budget_breakdown: splitBudget(budget, config.breakdown),
      schedule_vii: campaignCategory,
      sdg_alignment: campaignIndex === 0 ? [1, 6, 11] : campaignIndex === 1 ? [4, 5, 8] : [3, 10, 12],
      start_date: input.start_date,
      end_date: input.end_date,
      impact_metrics: {
        beneficiaries: Math.max(50, Math.round(budget / 5000) + (campaignIndex * 25)),
        duration: `${input.start_date} to ${input.end_date}`,
      },
      milestones,
    }
  })
}