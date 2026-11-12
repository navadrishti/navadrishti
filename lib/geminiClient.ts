import { z } from "zod";
import type { Campaign } from "@/lib/csr-agent/llm";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GeminiGenerateResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

export class GeminiError extends Error {
  constructor(public status: number, message: string, public isSafety?: boolean) {
    super(message);
    this.name = "GeminiError";
  }
}

export async function GeminiChat(messages: ChatMessage[], retryCount = 0): Promise<string> {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) throw new Error("GEMINI_API_KEY is missing.");

  // Defaults track Google AI models available to new API keys (2026-11 probe).
  // Override via GEMINI_MODEL / GEMINI_FALLBACK_MODEL for non-production verification.
  const PRIMARY = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const FALLBACK = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";
  
  const currentModel = retryCount < 2 ? PRIMARY : FALLBACK;
  const URL = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${API_KEY}`;

  const conversation = messages.filter((m) => m.role !== "system");
  const systemMsg = messages.find((m) => m.role === "system");
  
  if (conversation.length === 0) throw new Error("At least one user/assistant message is required.");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: conversation.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        ...(systemMsg && { 
          systemInstruction: { parts: [{ text: systemMsg.content }] } 
        }),
        generationConfig: {
          temperature: 0.1, // Low temp for consistent CSR logic
          responseMimeType: "application/json", // Forces valid JSON output
          maxOutputTokens: 8192
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 5. ERROR & RETRY HANDLING
    if (!res.ok) {
      // Retry on Rate Limits (429) or Server Errors (5xx)
      if ((res.status === 429 || res.status >= 500) && retryCount < 3) {
        
        // A. Honor "Retry-After" header if Google provided one (in seconds)
        const retryAfterHeader = res.headers.get("retry-after");
        let waitTime = Math.pow(2, retryCount) * 1000 + Math.random() * 500; // Default: Exp. Backoff + Jitter

        if (res.status === 429 && retryAfterHeader) {
          const seconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(seconds)) waitTime = seconds * 1000;
        }

                await new Promise((r) => setTimeout(r, waitTime));
        return GeminiChat(messages, retryCount + 1);
      }
      
      throw new GeminiError(res.status, await res.text());
    }

    const data: GeminiGenerateResponse = await res.json();
    const candidate = data?.candidates?.[0];

    // 6. SAFETY FILTERS
    // Gemini may return a 200 OK but block the content. We must check finishReason.
    if (!candidate || candidate.finishReason === "SAFETY") {
      throw new GeminiError(res.status || 400, "Safety block or empty response.", true);
    }

    // 7. MULTI-PART EXTRACTION
    // Joins all text segments to ensure the full JSON string is captured.
    const output = candidate.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("")
      .trim();

    if (!output) throw new Error("Empty response from drafting service.");
    
    return output;

  } catch (error) {
    clearTimeout(timeoutId);
    
    // 8. TRANSIENT NETWORK FAILURES
    // Retries if the internet connection blipped (DNS/Socket issues).
    const isNetworkError = error instanceof TypeError || (error instanceof Error && error.name === 'FetchError');
    if (isNetworkError && retryCount < 3) {
      await new Promise((r) => setTimeout(r, 1500));
      return GeminiChat(messages, retryCount + 1);
    }

    // Pass the AbortError or standard errors back to the caller
    if (error instanceof Error && error.name === "AbortError") throw new Error("Drafting request timed out.");
    throw error;
  }
}

const enhancedCampaignSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  milestones: z.array(z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
  })),
});

const enhancedNgoDraftSchema = z.object({
  project: z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
  }),
  needs: z.array(z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    impact_description: z.string().trim().min(1),
  })),
});

function parseCopyJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Copy enhancement returned an invalid object.");
  }
  return parsed as Record<string, unknown>;
}

function copyOrFallback(value: string, fallback: string) {
  return value.trim() || fallback;
}

export async function enhanceCampaignCopy(campaign: Campaign): Promise<Campaign> {
  const prompt = `
Improve only the wording of this CSR campaign draft. Preserve meaning exactly.
Do not change any facts, category, location, budget, dates, beneficiary count, milestone count,
milestone budgets, duration, or deliverable meaning. Do not invent partners, claims, outcomes,
numbers, certifications, or commitments. Return JSON only.

Immutable campaign facts:
${JSON.stringify({
  category: campaign.category,
  location: campaign.location,
  budget_inr: campaign.budget_inr,
  start_date: campaign.start_date,
  end_date: campaign.end_date,
  beneficiaries: campaign.impact_metrics.beneficiaries,
  milestones: campaign.milestones.map((milestone) => ({
    budget_allocated: milestone.budget_allocated,
    duration_weeks: milestone.duration_weeks,
    start_date: milestone.start_date,
    end_date: milestone.end_date,
  })),
})}

Current copy:
${JSON.stringify({
  title: campaign.title,
  description: campaign.description,
  milestones: campaign.milestones.map((milestone) => ({
    title: milestone.title,
    description: milestone.description,
  })),
})}

Return:
{
  "title": "clear concise title",
  "description": "clear concise description",
  "milestones": [
    { "title": "clear title", "description": "specific description" }
  ]
}
`;

  try {
    const result = enhancedCampaignSchema.safeParse(
      parseCopyJson(await GeminiChat([{ role: "user", content: prompt }]))
    );
    if (!result.success || result.data.milestones.length !== campaign.milestones.length) {
      throw new Error("Copy enhancement did not preserve the campaign structure.");
    }

    return {
      ...campaign,
      title: copyOrFallback(result.data.title, campaign.title),
      description: copyOrFallback(result.data.description, campaign.description),
      milestones: campaign.milestones.map((milestone, index) => ({
        ...milestone,
        title: copyOrFallback(result.data.milestones[index].title, milestone.title),
        description: copyOrFallback(result.data.milestones[index].description, milestone.description),
      })),
    };
  } catch (error) {
    console.warn(
      "Campaign copy enhancement unavailable; preserving questionnaire draft.",
      error instanceof Error ? error.message : "unknown error"
    );
    return campaign;
  }
}

export type NgoCopyDraft = {
  project: { title: string; description: string; [key: string]: unknown };
  needs: Array<{ title: string; description: string; impact_description: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

export async function enhanceNgoCopy(draft: NgoCopyDraft): Promise<NgoCopyDraft> {
  const prompt = `
Improve only the wording of this NGO draft. Preserve meaning exactly.
Do not change request type, category, location, timeline, budget, beneficiary count, contact details,
urgency, material quantities, roles, durations, infrastructure scope, or any other facts.
Do not invent facts, numbers, partners, outcomes, or commitments. Return JSON only.

Current draft:
${JSON.stringify({
  project: { title: draft.project.title, description: draft.project.description },
  needs: draft.needs.map((need) => ({
    title: need.title,
    description: need.description,
    impact_description: need.impact_description,
  })),
})}

Return only:
{
  "project": { "title": "clear title", "description": "clear description" },
  "needs": [
    { "title": "clear title", "description": "clear description", "impact_description": "clear impact description" }
  ]
}
`;

  try {
    const result = enhancedNgoDraftSchema.safeParse(
      parseCopyJson(await GeminiChat([{ role: "user", content: prompt }]))
    );
    if (!result.success || result.data.needs.length !== draft.needs.length) {
      throw new Error("Copy enhancement did not preserve the NGO draft structure.");
    }

    return {
      ...draft,
      project: {
        ...draft.project,
        title: copyOrFallback(result.data.project.title, draft.project.title),
        description: copyOrFallback(result.data.project.description, draft.project.description),
      },
      needs: draft.needs.map((need, index) => ({
        ...need,
        title: copyOrFallback(result.data.needs[index].title, need.title),
        description: copyOrFallback(result.data.needs[index].description, need.description),
        impact_description: copyOrFallback(
          result.data.needs[index].impact_description,
          need.impact_description
        ),
      })),
    };
  } catch (error) {
    console.warn(
      "NGO copy enhancement unavailable; preserving questionnaire draft.",
      error instanceof Error ? error.message : "unknown error"
    );
    return draft;
  }
}

export async function suggestQuestionAnswer(input: {
          agent: "ngo" | "csr";
          question: string;
          context: Record<string, unknown>;
        }): Promise<string> {
          const prompt = `
        You are assisting a ${input.agent === "ngo" ? "NGO" : "CSR"} questionnaire.
        Suggest one practical answer to the current question using only the supplied context.
        Do not invent facts, commitments, exact numbers, contacts, dates, partners, or approvals.
        If the context is insufficient for a factual answer, provide a clearly labelled example or
        template with placeholders. Keep it concise and ready for the user to edit.
        Return JSON only in this shape: {"suggestion":"..."}.

        Current question: ${input.question}
        Known context:
        ${JSON.stringify(input.context)}
        `;

          const parsed = JSON.parse(await GeminiChat([{ role: "user", content: prompt }])) as unknown;
          const result = z.object({ suggestion: z.string().trim().min(1) }).safeParse(parsed);
          if (!result.success) throw new Error("Suggestion response was invalid.");
          return result.data.suggestion;
        }
