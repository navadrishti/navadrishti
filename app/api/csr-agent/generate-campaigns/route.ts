import { NextRequest, NextResponse } from "next/server";
import {
  generateCampaigns,
  buildFallbackCampaigns,
  generateCampaignsInputSchema,
  type Campaign,
} from "@/lib/csr-agent/llm";
import {
  enforceCsrGenerateAbuseLimit,
  resolveOwnedCompanyId,
} from "@/lib/csr-agent/generate-access";
import type { CapabilityMatch } from "@/lib/csr-agent/find-service-offers";
import { authErrorResponse, getAuthUserFromRequest } from "@/lib/server-auth";
import { zodIssuesToUserMessage } from "@/lib/user-facing-error";

type CampaignResponse =
  | { success: true;  data: Campaign[]; recommendations: CapabilityMatch[]; recommendationMessage: string; degraded?: boolean; warning?: string }
  | { success: false; error: string; details?: unknown };

export async function GET() {
  return NextResponse.json({ status: "ok" });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (user.user_type !== "company") {
      return NextResponse.json<CampaignResponse>(
        { success: false, error: "Only companies can generate campaigns" },
        { status: 403 }
      );
    }

    const abuseLimited = await enforceCsrGenerateAbuseLimit(user.id);
    if (abuseLimited) return abuseLimited;

    const body = await request.json();

    const ownership = resolveOwnedCompanyId(user, body?.company_id);
    if (!ownership.ok) {
      return NextResponse.json<CampaignResponse>(
        { success: false, error: ownership.error },
        { status: ownership.status }
      );
    }

    const validation = generateCampaignsInputSchema.safeParse({
      ...body,
      company_id: ownership.companyId,
    });

    if (!validation.success) {
      return NextResponse.json<CampaignResponse>(
        {
          success: false,
          error: zodIssuesToUserMessage(validation.error.issues),
        },
        { status: 400 }
      );
    }

    // Recommendations are independent of drafting. Echo caller-provided matches only.
    const recommendations: CapabilityMatch[] = Array.isArray(body.recommendations)
      ? body.recommendations
      : [];

    let campaigns: Campaign[];
    let degraded = false;
    let warning = "";

    try {
      campaigns = await generateCampaigns(validation.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "LLM call failed";
      const canFallback =
        message.includes("currently unavailable") ||
        message.includes("GEMINI_API_KEY") ||
        message.includes("Gemini API key") ||
        message.includes("API Key not found") ||
        message.includes("Failed to parse LLM response") ||
        message.includes("Gemini API 400") ||
        message.includes("Gemini request timed out") ||
        message.includes("Invalid LLM response");

      if (!canFallback) {
        const status = message.includes(" 429:") ? 429 : 502;
        return NextResponse.json<CampaignResponse>(
          { success: false, error: "Campaign drafting is currently unavailable. Please try again." },
          { status }
        );
      }

      campaigns = buildFallbackCampaigns(validation.data);
      degraded = true;
      warning = "Generated fallback drafts because the AI model is currently unavailable.";
    }

    return NextResponse.json<CampaignResponse>({
      success: true,
      data: campaigns,
      recommendations,
      degraded,
      warning: degraded ? warning : undefined,
      recommendationMessage: recommendations.length > 0
        ? "Capability recommendations were matched and used in the CSR draft."
        : "No strong capability matches were found for this CSR request.",
    });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    console.error("generate-campaigns error:", error instanceof Error ? error.name : "error");
    return NextResponse.json<CampaignResponse>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
