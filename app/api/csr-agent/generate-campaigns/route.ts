import { NextRequest, NextResponse } from "next/server";
import {
  generateCampaigns,
  buildFallbackCampaigns,
  generateCampaignsInputSchema,
  type Campaign,
} from "@/lib/csr-agent/llm";
import type { CapabilityMatch } from "@/lib/csr-agent/find-service-offers";

/* ───────────────── TYPES ───────────────── */

type CampaignResponse =
  | { success: true;  data: Campaign[]; recommendations: CapabilityMatch[]; recommendationMessage: string; degraded?: boolean; warning?: string }
  | { success: false; error: string; details?: unknown };

/* ───────────────── ROUTES ───────────────── */

export async function GET() {
  return NextResponse.json({ status: "ok" });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validation = generateCampaignsInputSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json<CampaignResponse>(
        {
          success: false,
          error:   "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // Recommendations are now independent of the LLM. If the caller provides
    // a `recommendations` array in the request body, we'll echo it back in the
    // response. Do NOT perform server-side matching here to keep concerns
    // separated and avoid unexpected DB calls from the LLM flow.
    const recommendations: CapabilityMatch[] = Array.isArray((body as any).recommendations)
      ? (body as any).recommendations
      : [];

    let campaigns: Campaign[];
    let degraded = false;
    let warning = "";

    try {
      campaigns = await generateCampaigns(validation.data);
    } catch (err) {
      console.error("LLM error:", err);

      const message = err instanceof Error ? err.message : "LLM call failed";
      const canFallback =
        message.includes("GEMINI_API_KEY") ||
        message.includes("Gemini API key") ||
        message.includes("API Key not found") ||
        message.includes("Failed to parse LLM response") ||
        message.includes("Gemini API 400") ||
        message.includes("Gemini request timed out")

      if (!canFallback) {
        const status = message.includes(" 429:") ? 429 : 502;
        return NextResponse.json<CampaignResponse>(
          { success: false, error: message },
          { status }
        );
      }

      campaigns = buildFallbackCampaigns(validation.data);
      degraded = true;
      warning = "Generated fallback drafts because the AI model is currently unavailable."
    }

    return NextResponse.json<CampaignResponse>({
      success: true,
      data:    campaigns,
      recommendations,
      degraded,
      warning: degraded ? warning : undefined,
      recommendationMessage: recommendations.length > 0
        ? "Capability recommendations were matched and used in the CSR draft."
        : "No strong capability matches were found for this CSR request.",
    });
  } catch (error) {
    console.error("generate-campaigns error:", error);
    return NextResponse.json<CampaignResponse>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}