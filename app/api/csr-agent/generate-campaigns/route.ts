import { NextRequest, NextResponse } from "next/server";
import {
  generateCampaigns,
  generateCampaignsInputSchema,
  type Campaign,
} from "@/lib/csr-agent/llm";

/* ───────────────── TYPES ───────────────── */

type CampaignResponse =
  | { success: true;  data: Campaign[] }
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
    });
  } catch (error) {
    console.error("generate-campaigns error:", error);
    return NextResponse.json<CampaignResponse>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}