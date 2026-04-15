import { z } from "zod";
import { GeminiChat, GeminiError } from "@/lib/geminiClient";
import { parseJson } from "./json-parser";

/* ───────────────── SCHEMAS ───────────────── */

// Milestone defined by the user in the request
export const requestMilestoneSchema = z.object({
  description:      z.string().min(1),
  budget_allocated: z.number().positive(),
});

export const generateCampaignsInputSchema = z.object({
  company_id:     z.string().min(1),
  budget:         z.number().positive(),
  milestones:     z.number().int().min(1).max(10),
  category:       z.string().min(1),
  location:       z.string().min(1),
  start_date:     z.string().min(1),
  end_date:       z.string().min(1),
  milestone_info: z.array(requestMilestoneSchema).optional(),
  requirementDetails: z.string().trim().optional(),
});

// Milestone returned by the LLM in the response
export const responseMilestoneSchema = z.object({
  title:            z.string(),
  description:      z.string(),
  duration_weeks:   z.number().int(),
  budget_allocated: z.number(),
  deliverables:     z.array(z.string()),
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
  sdg_alignment: z.array(z.number()),
  start_date:    z.string(),
  end_date:      z.string(),

  impact_metrics: z.object({
    beneficiaries: z.number().int(),
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
    location,
    start_date,
    end_date,
    milestones,
    milestone_info,
    requirementDetails,
  } = input;

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
- Location: ${location}
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
- Beneficiary identification method
- Delivery model (NGO partner, camps, direct build, etc.)
- 2-3 specific ground execution steps in ${location}
- Description max 40 words per campaign

4. **Milestone Enhancement**
For each milestone:
- Assign logical duration_weeks
- Define exactly 3 clear, measurable deliverables

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
      "description": "max 40 words: execution method, beneficiary ID, ground steps in ${location} with respect to ${requirementDetails}",
      "category": "${category}",
      "location": "${location}",
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
    } 

    console.error("JSON parse failed:", err);
    throw new Error("Failed to parse LLM response");
  }
}