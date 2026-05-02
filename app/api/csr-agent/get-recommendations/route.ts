import { NextRequest, NextResponse } from "next/server";
import {
  findServiceOffers,
  InputSchema,
  type CapabilityMatch,
} from "@/lib/csr-agent/find-service-offers";

type RecommendationResponse =
  | { success: true; data: CapabilityMatch[] }
  | { success: false; error: string; details?: unknown };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validation = InputSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json<RecommendationResponse>(
        {
          success: false,
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    let matches: CapabilityMatch[] = [];
    try {
      matches = await findServiceOffers(validation.data);
    } catch (err) {
      console.error("get-recommendations error:", err);
      return NextResponse.json<RecommendationResponse>(
        {
          success: false,
          error: err instanceof Error ? err.message : "Failed to fetch recommendations",
        },
        { status: 500 }
      );
    }

    return NextResponse.json<RecommendationResponse>({
      success: true,
      data: matches.slice(0, 5),
    });
  } catch (error) {
    console.error("get-recommendations route error:", error);
    return NextResponse.json<RecommendationResponse>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
