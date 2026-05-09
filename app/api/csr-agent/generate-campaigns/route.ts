import { NextRequest, NextResponse } from "next/server";
import {
  generateCampaigns,
  generateCampaignsInputSchema,
  type Campaign,
} from "@/lib/csr-agent/llm";
import type { CapabilityMatch } from "@/lib/csr-agent/find-service-offers";

/* ───────────────── TYPES ───────────────── */

type CampaignResponse =
  | { success: true;  data: Campaign[]; recommendations: CapabilityMatch[]; recommendationMessage: string }
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

    try {
      campaigns = await generateCampaigns(validation.data);
    } catch (err) {
      console.error("LLM error:", err);

      const message = err instanceof Error ? err.message : "LLM call failed";
      const status = message.includes(" 429:") ? 429 : 502;

      return NextResponse.json<CampaignResponse>(
        { success: false, error: message },
        { status }
      );
    }

    return NextResponse.json<CampaignResponse>({
      success: true,
      data:    campaigns,
      recommendations,
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